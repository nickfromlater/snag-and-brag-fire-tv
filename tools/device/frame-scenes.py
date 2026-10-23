"""Join real Toolkit/Render intervals to metadata-only native scene snapshots.

Uses the locally cached official Perfetto processor. Raw traces stay private;
the output contains only aggregate timings and a package hash. No screenshots
or remote input should occur during the measured interval.
"""
import argparse
import bisect
import csv
import io
import json
import os
from pathlib import Path
import statistics
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('trace', type=Path)
parser.add_argument('telemetry', type=Path)
parser.add_argument('--processor', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'perfetto-tp.py'))
parser.add_argument('--sha256', required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--pid', type=int)
args = parser.parse_args()

def query(sql):
    result = subprocess.run(['python3', args.processor, 'query', str(args.trace), sql],
                            capture_output=True, text=True, check=True)
    return list(csv.DictReader(io.StringIO(result.stdout)))

clock = query("SELECT ts,clock_value FROM clock_snapshot WHERE clock_name='REALTIME' ORDER BY id LIMIT 1")
if len(clock) != 1:
    raise RuntimeError('No real-time clock anchor; cannot label scene FPS honestly')
offset_ns = int(clock[0]['clock_value']) - int(clock[0]['ts'])
rows = query("""SELECT p.pid,p.name process_name,s.ts,s.dur FROM slice s
 JOIN thread_track tt ON s.track_id=tt.id JOIN thread t ON tt.utid=t.utid
 JOIN process p ON t.upid=p.upid
 WHERE t.name='Toolkit/Render' AND s.name='frame' AND s.dur>0 ORDER BY s.ts""")
counts = {}
for r in rows:
    if 'snagbrag' in r['process_name'].lower():
        pid = int(r['pid']); counts[pid] = counts.get(pid, 0) + 1
pid = args.pid or (max(counts, key=counts.get) if counts else None)
if pid is None:
    raise RuntimeError('Game render process not identified; pass its verified --pid')
frames = [int(r['ts']) for r in rows if int(r['pid']) == pid]
if len(frames) < 2:
    raise RuntimeError('Insufficient physical render frames')
states = []
for line in args.telemetry.read_text().splitlines():
    m = json.loads(line)
    if m.get('kind') == 'snapshot' and m.get('runtime') == 'native':
        states.append(m)
states.sort(key=lambda m: m['at'])
times = [m['at'] for m in states]

def scene(m):
    if not m.get('active') or m.get('paused'):
        return None
    s, p = m.get('scene'), m.get('phase')
    if s == 'lobby' and p == 'lobby': return 'lobby'
    if s == 'intro' and p == 'reel': return 'prompt-reel'
    if s == 'hunt' and p == 'hunt': return 'hunt-feeds'
    if s == 'hunt' and p == 'glow': return 'glow-up'
    if s == 'judge': return 'color-rush'
    if s == 'brag' and p == 'mash': return 'brag-mash'
    if s == 'show': return 'showstopper'
    if s == 'stand' and p == 'standings': return 'standings'
    if s == 'champ': return 'finale'
    return None

def phase(m):
    s, p = m.get('scene'), m.get('phase')
    if not m.get('active') or m.get('paused'): return None
    if s == 'intro' and p == 'title': return 'round-title'
    if s == 'hunt' and p == 'countdown' or s == 'intro' and p == 'countdown': return 'countdown'
    if s == 'judge': return 'judge-winner' if m.get('banner') else 'judge-cards'
    if s == 'brag': return {'brag-intro': 'brag-intro', 'brag-lines': 'brag-lines', 'mash': 'brag-mash', 'knockout': 'knockout'}.get(p)
    if s == 'show': return 'show-winner' if m.get('winner') else {'runway': 'showstopper', 'vote': 'show-vote', 'tally': 'show-tally'}.get(p)
    if s == 'champ': return 'finale-podium' if p == 'podium' else 'finale'
    return scene(m)

def label(ts, classify=scene):
    epoch_ms = (ts + offset_ns) / 1e6
    i = bisect.bisect_right(times, epoch_ms) - 1
    # Stalled/dead telemetry must never turn another process's frames into a pass.
    if i < 0 or epoch_ms - times[i] > 2000: return None
    m = states[i]
    return (classify(m), m.get('round'))

gaps = {}
for first, last in zip(frames, frames[1:]):
    a, b = label(first), label(last)
    if not a or a != b or not a[0]: continue
    gaps.setdefault(a[0], []).append((last - first) / 1e6)
names = ['lobby', 'prompt-reel', 'hunt-feeds', 'glow-up', 'color-rush', 'brag-mash', 'showstopper', 'standings', 'finale']
metrics = []
for name in names:
    values = gaps.get(name, [])
    if not values:
        metrics.append({'scene': name, 'measured': False}); continue
    ordered = sorted(values)
    seconds = sum(values) / 1000
    fps = len(values) / seconds
    metrics.append({'scene': name, 'measured': True, 'intervals': len(values),
                    'sampleSeconds': round(seconds, 3), 'fps': round(fps, 2),
                    'medianGapMs': round(statistics.median(values), 2),
                    'p95GapMs': round(ordered[min(len(ordered)-1, int(len(ordered)*.95))], 2),
                    'maxGapMs': round(max(values), 2), 'gapsOver100ms': sum(v > 100 for v in values)})
phase_gaps = {}
for first, last in zip(frames, frames[1:]):
    a, b = label(first, phase), label(last, phase)
    if a and a == b and a[0]: phase_gaps.setdefault(a[0], []).append((last - first) / 1e6)
phase_metrics = []
for name, values in sorted(phase_gaps.items()):
    ordered = sorted(values)
    phase_metrics.append({'phase': name, 'intervals': len(values), 'sampleSeconds': round(sum(values) / 1000, 3),
                          'fps': round(len(values) * 1000 / sum(values), 2),
                          'p95GapMs': round(ordered[min(len(ordered)-1, int(len(ordered)*.95))], 2),
                          'maxGapMs': round(max(values), 2), 'gapsOver100ms': sum(v > 100 for v in values)})

def window_metrics(start_ms, end_ms):
    values = [(b-a)/1e6 for a,b in zip(frames, frames[1:])
              if start_ms <= (a+offset_ns)/1e6 and (b+offset_ns)/1e6 <= end_ms]
    if not values: return {'measured': False}
    ordered = sorted(values)
    return {'measured': True, 'intervals': len(values), 'sampleSeconds': round(sum(values)/1000, 3),
            'fps': round(len(values)*1000/sum(values), 2),
            'p95GapMs': round(ordered[min(len(ordered)-1, int(len(ordered)*.95))], 2),
            'maxGapMs': round(max(values), 2), 'gapsOver100ms': sum(v > 100 for v in values)}

payoffs = []
for line in args.telemetry.read_text().splitlines():
    m = json.loads(line)
    if m.get('kind') != 'celebration' or m.get('runtime') != 'native' or m.get('status') != 'start': continue
    if not ((frames[0]+offset_ns)/1e6 <= m['at'] <= (frames[-1]+offset_ns)/1e6-8000): continue
    payoffs.append({'payoff': m.get('payoff'), 'at': m['at'],
                    'burst0to2p5s': window_metrics(m['at'], m['at']+2500),
                    'settled2p5to8s': window_metrics(m['at']+2500, m['at']+8000)})

losses = query("SELECT name,idx,value,severity FROM stats WHERE value>0 AND (severity='data_loss' OR name LIKE '%discard%' OR name LIKE '%overwrit%')")
unlabelled = sum(not label(a) or not label(a)[0] or not label(b) or not label(b)[0] for a,b in zip(frames,frames[1:]))
result = {'source': 'physical stick Perfetto Toolkit/Render frame-start intervals, REALTIME clock join to native snapshots',
          'packageSha256': args.sha256,
          'scope': 'Actual native UI render frames, not JavaScript callback counts or video metadata; includes scene entrance/exit work within matching phase labels',
          'traceSeconds': round((frames[-1]-frames[0])/1e9, 3),
          'traceStartEpochMs': round((frames[0]+offset_ns)/1e6), 'traceEndEpochMs': round((frames[-1]+offset_ns)/1e6),
          'traceDataLossStats': losses, 'unlabelledIntervals': unlabelled,
          'allNineScenesMeasured': all(m['measured'] for m in metrics), 'scenes': metrics, 'phases': phase_metrics, 'celebrations': payoffs}
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(result, indent=2) + '\n')
for m in metrics:
    print(m['scene'], f"{m['fps']:.2f} fps / {m['sampleSeconds']:.3f}s / max {m['maxGapMs']:.2f}ms" if m['measured'] else 'NOT MEASURED')
