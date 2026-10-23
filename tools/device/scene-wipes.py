"""Frame presentation around each scene change (the 1 s wipe), from a graphics trace + runtime.jsonl.
usage: python3 scene-wipes.py TRACE RUNTIME.jsonl [--before MS] [--after MS]
Window per `cue: scene` = [at - before, at + after]; prints frames, fps, p95, max gap."""
import argparse, bisect, csv, io, json, os, subprocess
ap = argparse.ArgumentParser(); ap.add_argument('trace'); ap.add_argument('telemetry')
ap.add_argument('--before', type=int, default=100); ap.add_argument('--after', type=int, default=1300)
ap.add_argument('--processor', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'perfetto-tp.py'))
a = ap.parse_args()
def q(sql):
    r = subprocess.run(['python3', a.processor, 'query', a.trace, sql], capture_output=True, text=True, check=True)
    return list(csv.DictReader(io.StringIO(r.stdout)))
c = q("SELECT ts,clock_value FROM clock_snapshot WHERE clock_name='REALTIME' ORDER BY id LIMIT 1")
off = int(c[0]['clock_value']) - int(c[0]['ts'])
rows = q("""SELECT p.name pname, s.ts FROM slice s JOIN thread_track tt ON s.track_id=tt.id JOIN thread t ON tt.utid=t.utid
 JOIN process p ON t.upid=p.upid WHERE s.name='gwsi_surfacePresented' ORDER BY s.ts""")
F = [(int(r['ts']) + off) / 1e6 for r in rows if 'snagbrag' in (r['pname'] or '').lower()]
cues = [json.loads(l) for l in open(a.telemetry) if '"cue":"scene"' in l]
cues = [m for m in cues if m.get('runtime') == 'native' and F[0] <= m['at'] <= F[-1]]
allmax = []
print(f"{'change':24s} {'frames':>6s} {'fps':>6s} {'p95ms':>6s} {'maxms':>6s} {'>50ms':>5s}")
for m in cues:
    t0, t1 = m['at'] - a.before, m['at'] + a.after
    i, j = bisect.bisect_left(F, t0), bisect.bisect_right(F, t1)
    w = F[max(i - 1, 0):j + 1]  # include the frames bracketing the window
    gaps = sorted(y - x for x, y in zip(w, w[1:]))
    if not gaps: continue
    allmax.append(gaps[-1])
    print(f"{m['from'] + '->' + m['scene']:24s} {j - i:6d} {(j - i) / ((t1 - t0) / 1000):6.1f} {gaps[int(len(gaps) * .95)]:6.1f} {gaps[-1]:6.1f} {sum(g > 50 for g in gaps):5d}")
print('scene changes', len(allmax), 'worst max gap', round(max(allmax), 1) if allmax else '-')
