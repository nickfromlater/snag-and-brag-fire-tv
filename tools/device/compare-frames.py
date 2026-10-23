"""Print per-scene stick frame metrics, before vs after, plus JS-blocking native work.

usage: python3 compare-frames.py BEFORE.json AFTER.json   (outputs of game-frames.py)
Verdict target: every scene at or near 30 fps, no gap over 150 ms in normal play.
"""
import json, sys
a, b = (json.load(open(p)) for p in sys.argv[1:3])
def row(name, x, y):
    f = lambda v: f"{v['fps']:6.1f} {v['p95Ms']:7.0f} {v['maxMs']:7.0f} {v['over150']:5d} {v.get('renderP50Ms', '-'):>5} {v.get('over16Pct', '-'):>4}" if v else '     -       -       -     -     -    -'
    print(f"{name:22s} | {f(x)} | {f(y)}")
print('render = per-frame draw cost (p50 ms, % over the 16 ms budget for 60 fps); presents/sec only means smoothness while the screen moves')
print(f"{'':22s} | {'BEFORE fps  p95ms  maxms >150 rend  >16':41s} | AFTER fps  p95ms  maxms >150 rend  >16")
for k in list(dict.fromkeys(list(a['scenes']) + list(b['scenes']))): row(k, a['scenes'].get(k), b['scenes'].get(k))
row('WHOLE GAME', a['overall'], b['overall'])
print('\nphases (after):')
for k, v in b['phases'].items(): print(f"  {k:26s} {v['fps']:6.1f} fps  p95 {v['p95Ms']:6.0f}  max {v['maxMs']:6.0f}  >150: {v['over150']}  render p50 {v.get('renderP50Ms', '-')} p95 {v.get('renderP95Ms', '-')} >16ms {v.get('over16Pct', '-')}%")
for label, d in (('before', a), ('after', b)):
    print(f'\nJS-blocking native work ({label}):')
    for k, v in list(d.get('jsBlockingNativeWork', {}).items())[:10]: print(f"  {k:36s} n={v['count']:4d} total={v['totalMs']:6d} ms p50={v['p50Ms']} max={v['maxMs']}")
scenes = b['scenes']
ok = all(v['fps'] >= 27 for v in scenes.values()) and b['overall']['over150'] == 0
print('\nVERDICT:', 'PASS (every scene >= 27 fps, no gap > 150 ms)' if ok else 'NOT YET: ' + ', '.join(f"{k} {v['fps']} fps/{v['over150']} gaps" for k, v in scenes.items() if v['fps'] < 27 or v['over150']))
print('Worst gaps (after):')
for g in sorted(b['gapsOver100'], key=lambda g: -g['gapMs'])[:8]: print(' ', g['atS'], 's', g['gapMs'], 'ms', g['phase'], '|', ', '.join(g['coincident'][:6]))
