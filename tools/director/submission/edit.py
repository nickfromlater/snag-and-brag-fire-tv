# Submission cut: native VVD showcase footage (take-02, plus phone-take round one),
# the real phone controller beside the TV, the game's own soundtrack with Polly host,
# captions, real-TV card, architecture card, end card.
import json, os, subprocess, sys
F = os.path.expanduser('~/builds/snag-and-brag/footage')
E, G = f'{F}/edit', f'{F}/graphics'
OUT = f'{E}/segs'; os.makedirs(OUT, exist_ok=True)
FPS = 60
cfg = json.load(open(f'{E}/sync.json'))   # offsets measured from scene wipes

def tv_source(at, src):
    if src == 'R1': return f'{F}/phone-take-01/tv-round1.mp4', at / 1000 - cfg['r1_at0'] + cfg['r1_off']
    if at < 166_000: return f'{F}/vvd-take-02/segments/part-01.mp4', at / 1000 + cfg['s1_off']
    return f'{F}/vvd-take-02/segments/raw-part-2.mp4', at / 1000 - 167 + cfg['s2_off']

def ff(args):
    r = subprocess.run(['ffmpeg', '-v', 'error', '-y', *args], capture_output=True, text=True)
    if r.returncode: sys.exit(r.stderr[-3000:])

VENC = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', str(FPS)]
AENC = ['-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2']

def game(n, t0, t1, src='T', layout='full', phone=None, caps=(), hold=0.0, mask=False, camtag=False):
    d = (t1 - t0) / 1000; path, v0 = tv_source(t0, src)
    a = ['-ss', f'{v0:.3f}', '-t', f'{d:.3f}', '-i', path,
         '-ss', f'{t0/1000:.3f}', '-t', f'{d + hold:.3f}', '-i', f'{E}/soundtrack.wav']
    fc, last, k = [], '[0:v]', 2
    tv = f'{last}fps={FPS},setpts=PTS-STARTPTS' + (f",drawbox=x=1026:y=700:w=240:h=58:color=0xFDF6EC:t=fill" if mask else '') + (f',tpad=stop_mode=clone:stop_duration={hold}' if hold else '')
    if layout == 'full':
        fc.append(tv + ',scale=1920:1080,setsar=1[v0]'); last = '[v0]'
    else:
        ps, pt0 = phone
        a += ['-loop', '1', '-i', f'{G}/splitbg.png', '-ss', f'{pt0:.3f}', '-t', f'{d + hold:.3f}', '-i', ps, '-loop', '1', '-i', f'{G}/bezel.png']
        fc.append(tv + ',scale=1408:792,setsar=1[tv]')
        fc.append(f'[3:v]fps={FPS},setpts=PTS-STARTPTS,scale=400:866,setsar=1' + (f',tpad=stop_mode=clone:stop_duration={hold}' if hold else '') + '[ph]')
        fc.append(f'[2:v]fps={FPS},scale=1920:1080,setsar=1[bg];[bg][tv]overlay=40:142:shortest=1[b1];[b1][ph]overlay=1486:104:shortest=1[b2];[4:v]fps={FPS},scale=1920:1080[bz];[b2][bz]overlay=0:0:shortest=1[v0]')
        last = '[v0]'; k = 5
    for j, img in enumerate(['badge' if layout == 'full' else 'badgesplit'] + (['camtag'] if camtag else [])):
        a += ['-loop', '1', '-t', f'{d + hold:.3f}', '-i', f'{G}/{img}.png']
        fc.append(f'[{k}:v]fps={FPS},format=rgba[g{j}];{last}[g{j}]overlay=0:0:shortest=1[w{j}]'); last = f'[w{j}]'; k += 1
    for i, (cap, s, e) in enumerate(caps):
        a += ['-loop', '1', '-t', f'{d + hold:.3f}', '-i', f'{G}/cap-{cap}.png']
        fc.append(f'[{k}:v]fps={FPS},format=rgba,fade=in:st={s}:d=0.25:alpha=1,fade=out:st={e - 0.25}:d=0.25:alpha=1[c{i}];{last}[c{i}]overlay=0:0:shortest=1[v{i + 1}]')
        last = f'[v{i + 1}]'; k += 1
    total = d + hold
    fc.append(f'[1:a]afade=in:d=0.04,afade=out:st={total - 0.06:.3f}:d=0.06[aout]')
    ff([*a, '-filter_complex', ';'.join(fc), '-map', last, '-map', '[aout]', '-t', f'{total:.3f}', *VENC, *AENC, f'{OUT}/{n:02d}.mkv'])
    print(n, 'game', t0, t1, layout, round(total, 2))

def card(n, img, d, music='win', vol=0.55, fade_in=True):
    m = f'{os.path.expanduser("~/Desktop/Projects/snag-and-brag")}/assets/audio/music-{music}.wav'
    vf = f'fps={FPS},scale=1920:1080,setsar=1' + (',fade=in:d=0.3' if fade_in else '') + (f',fade=out:st={d - 0.6}:d=0.6' if n == 99 else '')
    ff(['-loop', '1', '-t', str(d), '-i', img, '-stream_loop', '-1', '-i', m, '-filter_complex',
        f'[0:v]{vf}[v];[1:a]volume={vol},afade=in:d=0.3,afade=out:st={d - 0.8}:d=0.8[a]', '-map', '[v]', '-map', '[a]', '-t', str(d), *VENC, *AENC, f'{OUT}/{n:02d}.mkv'])
    print(n, 'card', img, d)

def arch(n):
    parts = [(None, 2.4), ((0, 125, 960, 540), 2.6), ((455, 166, 1080, 608), 3.8), ((960, 125, 960, 540), 2.6)]
    a, fc, labels = [], [], []
    for i, (crop, d) in enumerate(parts):
        a += ['-loop', '1', '-t', str(d), '-i', f'{G}/arch.png']
        c = f'crop={crop[2]}:{crop[3]}:{crop[0]}:{crop[1]},' if crop else ''
        fc.append(f'[{i}:v]{c}scale=1920:1080,setsar=1,fps={FPS},fade=in:d=0.25[p{i}]'); labels.append(f'[p{i}]')
    total = sum(d for _, d in parts)
    m = os.path.expanduser('~/Desktop/Projects/snag-and-brag/assets/audio/music-lobby.wav')
    a += ['-stream_loop', '-1', '-i', m]
    fc.append(''.join(labels) + f'concat=n={len(parts)}:v=1[v];[{len(parts)}:a]volume=0.5,afade=in:d=0.3,afade=out:st={total - 0.8}:d=0.8[a]')
    ff([*a, '-filter_complex', ';'.join(fc), '-map', '[v]', '-map', '[a]', '-t', str(total), *VENC, *AENC, f'{OUT}/{n:02d}.mkv'])
    print(n, 'arch', total)

PC, PP = f'{E}/phone-clock.mp4', f'{E}/phone-pre.mp4'
plan = [
    lambda: card(0, f'{G}/device.png', 3.2, 'lobby', 0.5),
    lambda: game(1, 0, 3800, mask='lobby'),
    lambda: game(2, 3800, 7600, layout='split', phone=(f'{E}/phone-join.mp4', 0), caps=[(3, 0.3, 3.7)], mask=True),
    lambda: game(3, 12800, 20900, caps=[(8, 0.3, 5.0)]),
    lambda: game(4, 20900, 33000, src='R1', layout='split', phone=(f'{E}/phone-hunt.mp4', 0), caps=[(2, 0.5, 5.0), (4, 5.6, 11.8)], camtag=True),
    lambda: game(5, 42000, 46500, src='R1'),
    lambda: game(6, 46500, 60300, caps=[(5, 1.0, 7.0)]),
    lambda: game(7, 67750, 73950),
    lambda: game(8, 102800, 108000),
    lambda: game(9, 108000, 114500, layout='split', phone=(PC, 108.0), caps=[(6, 0.3, 6.2)]),
    lambda: game(10, 114500, 117950),
    lambda: game(11, 140000, 148700),
    lambda: game(12, 155300, 161800),
    lambda: game(13, 191200, 195000),
    lambda: game(14, 195000, 201500, layout='split', phone=(PC, 195.0), caps=[(7, 0.3, 6.2)]),
    lambda: game(15, 201500, 206300),
    lambda: game(16, 206700, 212800),
    lambda: game(17, 212900, 222000, hold=2.7),
    lambda: arch(19),
    lambda: card(99, f'{G}/end2.png', 6.5, 'lobby', 0.5, fade_in=False),
]
# Guard: no host line may straddle a cut (a segment edge that is not contiguous with its neighbour).
import re
voice = json.load(open(f'{E}/voice-placed.json'))
segs = [tuple(map(int, m)) for m in re.findall(r'game\(\d+, (\d+), (\d+)', open(__file__).read())]
edges = [a for i, (a, b) in enumerate(segs) if i == 0 or segs[i - 1][1] != a] + [b for i, (a, b) in enumerate(segs) if i + 1 < len(segs) and segs[i + 1][0] != b]  # last segment holds 2.7 s past its end
bad = [(e, v['text'][:40]) for e in edges for v in voice if v['startMs'] < e < v['endMs']]
if bad: sys.exit(f'host line straddles a cut: {bad}')
only = set(map(int, sys.argv[1:]))
for i, step in enumerate(plan):
    n = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,19,99][i]
    if not only or n in only: step()
