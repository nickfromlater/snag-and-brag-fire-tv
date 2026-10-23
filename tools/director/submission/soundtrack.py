# Rebuild the game's own soundtrack for the showcase timeline from its cue stream:
# music moods (looped, 400 ms crossfade, ducked -6 dB under the host), every sfx cue
# with the TV's file selection, and Sir Socksworth's Polly lines queued like the TV does.
import json, wave, sys, os
import numpy as np

REPO = os.path.expanduser('~/Desktop/Projects/snag-and-brag')
EDIT = os.path.expanduser('~/builds/snag-and-brag/footage/edit')
SR = 48000
man = json.load(open(f'{REPO}/assets/audio/manifest.json'))
files = man['files']

def load(path):
    with wave.open(path) as w:
        assert w.getframerate() == SR, path
        a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
        return a.reshape(-1, w.getnchannels()) if w.getnchannels() == 2 else np.repeat(a[:, None], 2, 1)

cache = {}
def clip(fid):
    if fid not in cache: cache[fid] = load(f'{REPO}/assets/audio/{fid}.wav')
    return cache[fid]

def select(name, args, serial):
    bank = [f for f in files if f['kind'] == 'sfx' and f['effect'] == name]
    if not bank: return None
    if name in ('voice', 'boom'): return bank[serial % len(bank)]['id']
    if name == 'react':
        kind = str(args[0] if args else 'star'); b = [f for f in bank if f['parameters'].get('kind') == kind]
        n = int(args[1] if len(args) > 1 else 0) % 10
        hit = [f for f in b if f['parameters'].get('n') == n]
        return (hit or b or bank)[0 if hit else serial % len(b or bank)]['id']
    p = 'p' if name == 'mtick' else 'sec' if name in ('drumroll', 'riser') else 'v' if name == 'crowd' else 'n'
    v = float(args[1] if len(args) > 1 else .16) if name == 'crowd' else (int(args[0] if args else 0) % 13) if name == 'mash' else float(args[0] if args else 0)
    return sorted(bank, key=lambda f: abs(float(f['parameters'].get(p, 0)) - v))[0]['id']

cues = json.load(open(f'{EDIT}/cues.json'))
lines = json.load(open(f'{EDIT}/host-lines.json'))
dur = max(c['at'] for c in cues) / 1000 + 8
N = int(dur * SR)
sfx = np.zeros((N, 2), np.float32); music = np.zeros((N, 2), np.float32); voice = np.zeros((N, 2), np.float32)

serial = 0
for c in cues:
    if c['k'] != 'sfx' or c['name'] == 'voice': continue
    fid = select(c['name'], c.get('args') or [], serial); serial += 1
    if not fid: continue
    a = clip(fid); s = int((c['at'] + (c.get('delayMs') or 0)) / 1000 * SR)
    e = min(N, s + len(a)); sfx[s:e] += a[:e - s]

# Music: mood changes, looped file, linear 400 ms crossfade.
moods = [(c['at'], c['mood']) for c in cues if c['k'] == 'music']
FADE = int(.4 * SR)
for i, (at, mood) in enumerate(moods):
    s = int(at / 1000 * SR); e = int(moods[i + 1][0] / 1000 * SR) + FADE if i + 1 < len(moods) else N
    e = min(e, N)
    if mood == 'off' or s >= e: continue
    loop = clip('music-' + mood); n = e - s
    seg = np.tile(loop, (n // len(loop) + 1, 1))[:n].copy()
    env = np.ones(n, np.float32); f = min(FADE, n)
    if i > 0: env[:f] = np.linspace(0, 1, f)
    if i + 1 < len(moods): env[-f:] = np.minimum(env[-f:], np.linspace(1, 0, f))
    music[s:e] += seg * env[:, None]

# Host voice: lines queue (never overlap), as the TV's single speech bus does.
free = 0; placed = []
for i, l in enumerate(lines):
    a = load(f'{EDIT}/voice/{i:02d}.wav') * 1.0
    s = max(int(l['atMs'] / 1000 * SR), free)
    e = min(N, s + len(a)); voice[s:e] += a[:e - s]; free = e + int(.15 * SR)
    placed.append({'i': i, 'atMs': l['atMs'], 'startMs': round(s / SR * 1000), 'endMs': round(e / SR * 1000), 'text': l['text']})

# Duck music -6 dB while the host speaks (60 ms ramps).
duck = np.ones(N, np.float32)
for p in placed: duck[int(p['startMs'] / 1000 * SR):int(p['endMs'] / 1000 * SR)] = 10 ** (-6 / 20)
k = int(.06 * SR); duck = np.convolve(duck, np.ones(k) / k, mode='same').astype(np.float32)

# Voice level: bring Polly to sit on top of the game mix.
vr = np.sqrt(np.mean(voice[np.abs(voice).sum(1) > 1e-4] ** 2)); sr_ = np.sqrt(np.mean(sfx[np.abs(sfx).sum(1) > 1e-4] ** 2))
mix = sfx * 0.8 + music * duck[:, None] * 0.7 + voice * 2.2
peak = np.abs(mix).max(); mix = mix / max(1.0, peak / 0.95)
print('voice rms', vr, 'sfx rms', sr_, 'peak', peak, 'seconds', dur)
with wave.open(f'{EDIT}/soundtrack.wav', 'w') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(mix, -1, 1) * 32767).astype(np.int16).tobytes())
json.dump(placed, open(f'{EDIT}/voice-placed.json', 'w'), indent=1)
