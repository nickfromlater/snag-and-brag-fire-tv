"""Whole-game frame presentation per scene/phase on the physical stick.

Input: a Perfetto trace recorded with the `graphics` category (small enough for a
full game in one buffer) and the control server's runtime.jsonl. Frames are the
compositor's `gwsi_surfacePresented` events for the game process; scenes come from
the native snapshot telemetry joined on the REALTIME clock. Every presentation gap
over 100 ms is listed with the telemetry that coincided with it (scene/phase change,
cue, voice line, photo decode, audio error, native media calls over 20 ms).
Output is aggregate metadata only; no media or identifiers.

usage: python3 game-frames.py TRACE RUNTIME.jsonl --output OUT.json [--processor P]
"""
import argparse, bisect, csv, io, json, os, re, statistics, subprocess
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument('trace', type=Path); ap.add_argument('telemetry', type=Path)
ap.add_argument('--processor', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'perfetto-tp.py'))
ap.add_argument('--output', type=Path, required=True)
ap.add_argument('--label', default='')
args = ap.parse_args()

def query(sql):
    r = subprocess.run(['python3', args.processor, 'query', str(args.trace), sql], capture_output=True, text=True, check=True)
    return list(csv.DictReader(io.StringIO(r.stdout)))

clock = query("SELECT ts,clock_value FROM clock_snapshot WHERE clock_name='REALTIME' ORDER BY id LIMIT 1")
offset = int(clock[0]['clock_value']) - int(clock[0]['ts'])
rows = query("""SELECT p.pid, p.name pname, s.ts, a.display_value v FROM slice s
 JOIN thread_track tt ON s.track_id=tt.id JOIN thread t ON tt.utid=t.utid JOIN process p ON t.upid=p.upid
 LEFT JOIN args a ON a.arg_set_id=s.arg_set_id AND a.key='debug.value'
 WHERE s.name='gwsi_surfacePresented' ORDER BY s.ts""")
rows = [r for r in rows if 'snagbrag' in (r['pname'] or '').lower()]
# Count the app's UI surface only: a native video surface presents on its own surface ID.
import os
SURF = os.environ.get('SURFACE', '1')
if SURF != 'all': rows = [r for r in rows if ('surfaceID:' + SURF + ',') in (r['v'] or '')]
frames = [((int(r['ts']) + offset) / 1e6, r['v'] or '') for r in rows]
if len(frames) < 2: raise SystemExit('no presented frames for the game process')
t_first, t_last = frames[0][0], frames[-1][0]

events = []
for line in args.telemetry.read_text().splitlines():
    try: m = json.loads(line)
    except ValueError: continue
    if m.get('runtime') == 'native' and t_first - 5000 <= m.get('at', 0) <= t_last + 5000: events.append(m)
events.sort(key=lambda m: m['at'])
snaps = [m for m in events if m['kind'] == 'snapshot']
stimes = [m['at'] for m in snaps]

def phase(m):
    if not m.get('active') or m.get('paused'): return None
    s, p = m.get('scene'), m.get('phase')
    if s == 'lobby': return 'lobby'
    if s == 'intro': return 'intro/' + str(p)
    if s == 'hunt': return 'hunt/' + str(p)
    if s == 'judge': return 'judge/' + ('winner' if m.get('banner') else str(p))
    if s == 'show': return 'show/' + ('winner' if m.get('winner') else str(p))
    return f'{s}/{p}'

def label(t):
    i = bisect.bisect_right(stimes, t) - 1
    if i < 0 or t - stimes[i] > 2500: return None
    return phase(snaps[i])

def stats(values, renders=()):
    # renderTime is what a frame costs to draw. With idle loops cut, a still screen stops presenting,
    # so presents/sec measures redraw demand there; render cost is what says whether motion can hold 60.
    o = sorted(values); secs = sum(values) / 1000; r = sorted(renders)
    cost = {'renderP50Ms': r[len(r) // 2], 'renderP95Ms': r[min(len(r) - 1, int(len(r) * .95))], 'over16Pct': round(100 * sum(x > 16 for x in r) / len(r))} if r else {}
    return {**cost, 'intervals': len(values), 'seconds': round(secs, 2), 'fps': round(len(values) / secs, 2) if secs else 0,
            'p95Ms': round(o[min(len(o) - 1, int(len(o) * .95))], 1), 'maxMs': round(o[-1], 1),
            'over100': sum(v > 100 for v in values), 'over150': sum(v > 150 for v in values)}

by_phase, by_scene, gaps, alls = {}, {}, [], []
rd_phase, rd_scene, rd_all = {}, {}, []
for (a, va), (b, vb) in zip(frames, frames[1:]):
    d = b - a; la = label(a); alls.append(d)
    rm = re.search(r'renderTime:(\d+)ms', vb); rv = int(rm.group(1)) if rm else None
    if rv is not None: rd_all.append(rv)
    if la:
        by_phase.setdefault(la, []).append(d); by_scene.setdefault(la.split('/')[0], []).append(d)
        if rv is not None: rd_phase.setdefault(la, []).append(rv); rd_scene.setdefault(la.split('/')[0], []).append(rv)
    if d > 100:
        near = []
        for m in events[bisect.bisect_left([e['at'] for e in events], a - 300):]:
            if m['at'] > b + 50: break
            k = m['kind']
            if k == 'snapshot': continue
            if k == 'native-work':
                if m.get('phase') == 'end' and m.get('milliseconds', 0) >= 20: near.append(f"{m.get('file')}:{m.get('target', '')} {m['milliseconds']}ms")
                continue
            if k == 'cue': near.append('cue:' + str(m.get('cue')) + (':' + str(m.get('target')) if m.get('target') else '')); continue
            near.append(k + (':' + str(m.get('file') or m.get('status') or m.get('trigger') or m.get('scene') or '') ))
        rt = re.search(r'renderTime:(\d+)ms', vb);
        gaps.append({'atS': round((a - t_first) / 1000, 2), 'gapMs': round(d, 1), 'phase': la, 'renderMs': int(rt.group(1)) if rt else None,
                     'coincident': sorted(set(near))[:14]})
order = []
for m in snaps:
    p = phase(m)
    if p and p not in order: order.append(p)
blocking = {}
for m in events:
    # native-load and native-set-srcObject run nested inside a src setter; count the outer call only.
    if m['kind'] == 'native-work' and m.get('phase') == 'end' and t_first <= m['at'] <= t_last and m.get('file') not in ('native-load', 'native-set-srcObject'):
        tgt = re.sub(r'[-:].*$', '', str(m.get('target', ''))) if m.get('file', '').startswith('native-') else ''
        blocking.setdefault(m['file'] + (':' + tgt if tgt else ''), []).append(m.get('milliseconds', 0))
blocking = {k: {'count': len(v), 'totalMs': sum(v), 'p50Ms': sorted(v)[len(v) // 2], 'maxMs': max(v)}
            for k, v in sorted(blocking.items(), key=lambda kv: -sum(kv[1])) if sum(v) >= 200}
result = {'label': args.label, 'source': 'gwsi_surfacePresented (graphics category) for the game process, REALTIME-joined to native snapshots',
          'traceSeconds': round((t_last - t_first) / 1000, 1), 'overall': stats(alls, rd_all),
          'scenes': {k: stats(v, rd_scene.get(k, ())) for k, v in by_scene.items()},
          'phases': {k: stats(by_phase[k], rd_phase.get(k, ())) for k in order if k in by_phase},
          'jsBlockingNativeWork': blocking, 'gapsOver100': gaps}
args.output.write_text(json.dumps(result, indent=1) + '\n')
print('overall', result['overall'])
for k, v in result['phases'].items(): print(f"{k:28s} {v['fps']:6.2f} fps p95 {v['p95Ms']:6.1f} max {v['maxMs']:7.1f} >100:{v['over100']} ({v['seconds']}s)")
print(len(gaps), 'gaps >100ms')
for g in sorted(gaps, key=lambda g: -g['gapMs'])[:25]: print(g)
