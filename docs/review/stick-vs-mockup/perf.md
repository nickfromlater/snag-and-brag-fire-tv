# Whole-game frame rate on the physical stick

Device: retail Fire TV Stick (callie, armv7, 1 GB, Vega OS 2.0). Each row is one full
hosted game (hosted relay, one synthetic protocol phone plus three bots, synthetic RAM-only
photos), diagnostic build (`debug: true`, Hermes `-O,-w,-g0`). Mac muted.

**Method.** `vega exec perf record --trace-categories="['graphics','lifecycle']"` for the
whole game in one 96 MB buffer (the `ui` category fills the buffer in ~100 s; `graphics`
alone covers a full game). Frames are the compositor's `gwsi_surfacePresented` events for
`com.snagbrag.tv`, joined on the REALTIME clock to the app's 1 Hz scene snapshots.
`tools/device/game-frames.py` computes fps (presented frames / time), p95 frame interval,
max gap, and lists every gap over 100 ms with the telemetry that coincided with it.
Caveat: a frame is only presented when something on screen changes, so a still screen
reads as low fps. Every scene in this game has continuous motion (host, backdrop video or
loops), and the long gaps below coincide with blocked work, so they are real stalls.

## Status · Oct 20, late evening ET: all known blocking audio work removed, stick verdict pending

The stick went offline at 21:18 (TV off for the night), so every fix below is verified by
unit tests and on the Vega Virtual Device only. **Stick numbers are pending.** Code under
test: `e980215` (`w/stick-accept` with `w/clarity` at `97f11ee` merged, the lead's final
design for tonight: fresh-eye sweep fixes on top of the judge/vote band, one-line standings and
logo-raster wipe; plus the speech line clock from `216bed3`). Later commits on this branch
touch only docs.

VVD sanity on `e980215` (two games, Oct 20 ~23:40 ET): both completed three rounds and the
finale with 0 audio errors. Run 1 NOT YET on one 154 ms gap in round 1 judge (card flip,
confetti, points; no JS-blocking native call over 20 ms in it); run 2 PASS, max gap 132 ms
(finale), judge max 88 ms, worst wipe gap 53 ms. Treated as VVD noise; the stick verdict
decides. Run 2 had 4 blip fallbacks, all on the 2 s voice deadline: 3 lines whose Polly audio
had not arrived (not prefetched), 1 that started 150 ms before the deadline. None was a
`stream-stalled` failure. Receipt: `perf/vvd-head-e980215.json`.

### Tomorrow's stick window (about 25 minutes, verification only)

All five packages are prebuilt from `e980215`, including the music-fallback production
package, so nothing is built in the window. Always pass `PKG=`: both scripts otherwise look
for a package named after the current HEAD, which is a docs commit. If `w/clarity` moves
again, drop `NO_MERGE=1 NO_BUILD=1 PKG=…` from step 1 to merge and build fresh (about 10
minutes), then `zsh tools/device/stick-production.sh build`.

```sh
cd ~/Desktop/Projects/snag-and-brag && git pull --ff-only
B=~/builds/snag-and-brag
# 1. Verdict (about 10 min): SFX probe, full hosted game under trace, per-scene fps vs the Oct 20
#    baseline, then the frame gaps through each scene wipe.
NO_MERGE=1 NO_BUILD=1 PKG=$B/tv_armv7-verdict-e980215.vpkg zsh tools/device/stick-verdict.sh
# 1b. Only if judge is still slow: same code with the backdrop video released under the judge palette.
NO_MERGE=1 NO_BUILD=1 PKG=$B/tv_armv7-verdict-e980215-video-swap.vpkg zsh tools/device/stick-verdict.sh
# 1c. Only if step 1 says INVALID with audio errors (MediaError code 3: the stick cannot hold
#     6 music streams): two swapped music players, the pre-e6244e5 behaviour.
NO_MERGE=1 NO_BUILD=1 PKG=$B/tv_armv7-verdict-e980215-music-swap.vpkg zsh tools/device/stick-verdict.sh
# 2. Production, after step 1 PASS (game + rematch on the TV's room code, then promotion to tv_armv7-live.vpkg).
PKG=$B/tv_armv7-production-e980215.vpkg zsh tools/device/stick-production.sh install
PKG=$B/tv_armv7-production-e980215.vpkg zsh tools/device/stick-production.sh play <ROOM CODE>
# 2c. Instead of 2, only if 1c is the verdict that passed: the music-fallback production package.
PKG=$B/tv_armv7-production-e980215-music-swap.vpkg zsh tools/device/stick-production.sh install
PKG=$B/tv_armv7-production-e980215-music-swap.vpkg zsh tools/device/stick-production.sh play <ROOM CODE>
```

Only a passing step 2 (or 2c) promotes anything; then add the printed hash to
`VERIFIED_LIVE` in `tools/device/session.sh`. If 2c is the one promoted, set
`MUSIC_PLAYER_PER_TRACK = false` in `tv/src/stage/audio.ts` and commit it, so source matches
the live package.

| Package (`~/builds/snag-and-brag/`) | What differs | SHA-256 |
|---|---|---|
| `tv_armv7-verdict-e980215.vpkg` | diagnostic (hosted relay, debug telemetry, Hermes -O) | `d3f75b48a58574fcf7c676ebdcebf8a27855b31da39223b926e4512c0288c1b1` |
| `tv_armv7-verdict-e980215-video-swap.vpkg` | `NATIVE_BACKDROP_SINGLE_DECODER = false` | `ad3fa603c2eb43e6534ca9b8767f7e779d39ccdfea65ffe8384896c793287480` |
| `tv_armv7-verdict-e980215-music-swap.vpkg` | `MUSIC_PLAYER_PER_TRACK = false` | `ff89273592f5df843800c4a63bf53450d6a7daf6875635714d35763933fb3187` |
| `tv_armv7-production-e980215.vpkg` | production | `c21fb90d277dc87c475aa220e642a03bf763892dd2673ed68c2eb868ade52577` |
| `tv_armv7-production-e980215-music-swap.vpkg` | production, `MUSIC_PLAYER_PER_TRACK = false` | `650d13a85d1fbe65f4dc79b0fde4d5947f30ecec2dc145f4f3f5b2d9d8ae93b5` |

Both production packages passed the baked-flag inspection (hosted relay; debug, offline,
showcase and photoProbe false; no home path in the bundle). Neither is installed or verified.
The verdict script first plays nine SFX through the atlas and reports **INVALID** instead of
a pass if any clip fails to sound, any audio error occurs, or no Polly line plays (dead audio
once produced flattering frame rates). Superseded packages (`9608a9e`, `c72181f`, `c4f5cde`, `216bed3`)
were deleted.

### What to look for on the stick beyond the verdict line

- **No audio work left in the JS-blocking list.** On the VVD the only audio call left in the
  top list is `play` (687 calls, 0.5 s, max 8 ms). On the stick, music loads were up to
  694 ms each and Polly attach 130–700 ms per line.
- **Lip sync and line endings.** The host's mouth now runs on a wall clock per line (below).
  If it looks early or late against the voice on the TV, `STREAM_LATE_BIAS_MS` and
  `STREAM_CONFIRM_MS` in `tv/src/stage/audio.ts` are the knobs. On the VVD every line that
  ended on its own completed 1–72 ms after its full duration (never early).
- **Scene wipes.** The verdict prints the frame gaps from 0.1 s before to 1.3 s after each
  `cue: scene` (`tools/device/scene-wipes.py`). The cue is emitted as the wipe starts
  (`shared/src/game/core.ts`: 1000 ms, scene swap at 470 ms), so the window covers it. On the
  VVD every wipe is clean with either wipe, so only the stick shows whether the raster wipe
  fixed the mid-screen stall.

| Fix (commit) | What it removes | Expected effect on the stick (pending device verification) |
|---|---|---|
| SFX atlas (e5d5814, 307185f, 282e850) | 205 SFX `src` swaps per game: 32.6 s of blocked JS, p50 119 ms, max 835 ms, and the ANR that killed the baseline | No synchronous media load during play; the Thread Monitor kill path is gone. Fewer decoder pipelines spun up, so less CPU contention with the render thread |
| Motion tables (1297a66) | ~544 tables × 121 samples built at scene entrances: 16.3 s, max 515 ms | Samples drop to one per 30 fps frame (12–120), repeated beats come from a cache: roughly 3–5× less entrance work |
| One backdrop decoder (0c7b8d6) | 6 video `src` swaps/decoder rebuilds per game: 2.0 s, max 726 ms, at transitions | No video load after game start. **Look change:** non-starting moods show the still mood raster over the running video (`NATIVE_BACKDROP_SINGLE_DECODER`) |
| Polly attach scheduling (d6ca822) | Voice-clip MediaSource attach (130–700 ms) landing on scene entrances | Attach waits 900 ms after any scene/phase cue. Superseded by c72181f: the per-line attach no longer exists |
| Music per track (e6244e5) | About 15 music track loads per game at mood changes, up to 694 ms each | Six tracks (~100 KB OGG each) load once at startup; a mood change is seek, play and crossfade. Fallback flag `MUSIC_PLAYER_PER_TRACK` (package `-music-swap`) if the stick runs out of audio streams |
| One speech MediaSource (c72181f) | Per-line Polly attach: `srcObject` 4.8 s + `addSourceBuffer` 2.5 s per game on the stick baseline, 130–700 ms per line | One MediaSource attached in the lobby; each line is appended (VVD: 15 ms max) and played by seeking. Flag `SPEECH_SINGLE_SOURCE` |
| Judge beam blur (dad6faf) | The app's only blurred shadow, 22 px, on each card's sweeping beam | Judge ran at ~1 fps with a static background; this is the main suspect. **Look change:** native beam has no glow (`DISABLE_NATIVE_BLUR_SHADOWS`) |
| Speech line clock, no per-line volume (216bed3) | Two native `currentTime` reads per frame on the speech element for lip sync and end detection (VVD: 5,065 reads, max 91 ms); a `volume` write on that element every line (VVD: max 253 ms) | Position is a wall clock anchored on `playing` and one `currentTime` read 600 ms in, leaning 40 ms late; pause freezes it. Volume is set once at attach; the duck writes only the audible music track |
| Lead: particles off (4501089) | 576 React particle frames: 7.7 s | Already merged |

SFX atlas details: a Vorbis file (518 KB) with 1.5 s of silence between clips. A clip's end
timer runs 600 ms past its end, so start latency and late timers land in silence, never
in the next clip. Each voice warms its first seek silently during preload. The VVD probe
played all 112 clips twice: 224/224 sounded, seek-to-sound p50 103 ms, p95 279 ms, max
316 ms. Cost: effects now start about 0.1 s after their cue (the old path was 20–80 ms but
blocked JS for 119 ms or more on every swap).

### Vega Virtual Device (VVD, Mac, aarch64): a proxy, not the stick verdict

**Latest, VVD, `216bed3` (speech line clock, no per-line volume write), Oct 20 ~23:20 ET,
hosted relay:** PASS. Whole game 103.5 fps, p95 29 ms, max gap 86 ms (finale), 0 gaps over
100 ms; every scene 82–105 fps; three rounds and the finale; SFX probe 18/18; 28 Polly lines, 1 blip fallback, 0
audio errors; worst scene-wipe gap 44.8 ms (hunt→brag), none over 50 ms. Receipt:
`perf/vvd-clock-216bed3.json`.

**The last two blocking audio costs, VVD before (`c4f5cde`) vs after (`216bed3`), after audio
preload.** The 253 ms `volume` writes were not the music duck: they were the speech element's
own volume being reset to the same value on every line, right after its seek. The duck itself
cost 0–6 ms per write.

| JS-blocking call | VVD before (`c4f5cde`) | VVD after (`216bed3`) |
|---|---|---|
| Speech element `volume` | 26 calls, 1,010 ms, max 253 ms | **none** (set once at attach) |
| Speech element `currentTime` reads | 5,065 calls, 736 ms, max 91 ms | **28 calls (one per line), 5 ms, max 2 ms** |
| `volume`, all players (music fades and duck included) | 1,521 calls, 1,114 ms, max 253 ms | 1,262 calls, 100 ms, max 5 ms |
| `currentTime` reads outside the SFX probe | 5,065 | 28 |
| Top of the JS-blocking list | `set-volume` 1,077 ms, `get-currentTime` 729 ms, `play` 481 ms | `play` 521 ms, max 8 ms (nothing else) |

Line endings (Mac muted, so read from telemetry): 23 Polly lines ended on their own, each
1–72 ms after the clip's full duration (p50 18 ms), never early; 4 were cut by a scene change
and 1 by the game end, as before (`c4f5cde`: 22 ended, 3 scene, 1 hidden). The remaining
`currentTime` reads (81, max 206 ms) are all the SFX probe's own position checks before the
game starts.

**Earlier, VVD, `c4f5cde` (music per track, one speech MediaSource, `w/clarity` 5864549),
Oct 20 23:00 ET, hosted relay after its 23:00 redeploy:** PASS. Whole game 103.8 fps, p95
29 ms, max gap 99 ms (finale), 0 gaps over 100 ms; every scene 75–105 fps; three rounds and
the finale; SFX probe 18/18 (seek-to-sound p50 102 ms, max 292 ms); 25 Polly lines, 2 blip
fallbacks, 0 audio errors. Receipt: `perf/vvd-head-c4f5cde.json`.

**Music swaps and Polly attach no longer block the JS thread (VVD, native-work telemetry
after audio preload, one full game each):**

| JS-blocking call | VVD before (`9608a9e`) | VVD after (`c4f5cde`) |
|---|---|---|
| Music track load (`src` setter + load at mood changes) | 22 calls, 1,434 ms, max 298 ms | **none** (6 tracks load once at startup) |
| Polly attach (`srcObject` per line) | 26 calls, 333 ms, max 59 ms | **none** (one session MediaSource) |
| Polly `addSourceBuffer` per line | 26 calls, 70 ms, max 13 ms | none |
| Polly `appendBuffer` / `remove` | 26 calls, 4 ms | 25 calls, 17 ms, max 15 ms / 5 calls, 3 ms |
| Speech player `volume` (duck), unchanged path | 73 calls, 753 ms, max 190 ms | 28 calls, 1,010 ms, max 253 ms |
| Speech player `currentTime` reads | 2,363 calls, 147 ms, max 6 ms | 5,065 calls, 736 ms, max 91 ms |
| Any audio `src` setter after preload | 48 calls, 1,767 ms | 0 |

The stick's before numbers were far larger (baseline: Polly `srcObject` 4.8 s and
`addSourceBuffer` 2.5 s per game; music loads up to 694 ms each), so the removed work matters
more there than these VVD totals suggest.
Two earlier VVD games on the same audio code (`c72181f`, before the lead's 5864549) agree:
one PASS (`perf/vvd-stream-speech.json`, 27 Polly lines, 0 `src` loads after preload) and
one that returned to the lobby at round 2 brag-intro. In that one the relay socket closed
first (`relay-disconnected` code 1, then 1006 on retry, 22:31 ET, before the relay's
ASCII-only redeploy), and the pause and media-session PAUSED followed it. Not an audio
fault; it most likely matches the Vega WebSocket non-ASCII text-frame entry in
`docs/friction-raw.md`, which the redeploy addresses (unverified).

**Frame gaps around each scene change (VVD, 0.1 s before to 1.3 s after `cue: scene`):**

| Run | Scene changes | Worst max gap | Changes with a gap over 50 ms |
|---|---|---|---|
| `c72181f`, live-text wipe | 15 | 143.6 ms (round 3 hunt→show, with a photo decode and SFX) | 1 |
| `c4f5cde`, logo-raster wipe | 15 | 33.1 ms | 0 |

Every `c4f5cde` change ran at 101–106 fps through the wipe. The VVD never showed the stick's
mid-screen stall, so this is a proxy only.

Previous, HEAD `9608a9e`: whole game 103.8 fps, max gap 55 ms, 0 gaps over 100 ms; 26 Polly
lines, 0 audio errors. Receipt: `perf/vvd-head-9608a9e.json`.

Earlier VVD pair:

Same harness, same full hosted game, before = `8e879ec`, after = `0c7b8d6`+Polly scheduling
(the judge blur change came after this run). The VVD runs ~100 fps, so its fps say little
about the stick; the JS-blocking work is the useful part.

| JS-blocking native work per game | VVD before | VVD after |
|---|---|---|
| SFX/music/voice `src` setter | 355 calls, 35.3 s, p50 67 ms, max 605 ms | 49 calls (music + voice only), 1.3 s, p50 15 ms, max 119 ms |
| Backdrop video `src` | 9 calls, 2.0 s, max 715 ms | none |
| Motion tables | 721 builds, 1.2 s, max 143 ms | under 0.2 s in total |

| VVD scene | before fps / max gap | after fps / max gap |
|---|---|---|
| lobby | 72.8 / 57 ms | 74.4 / 33 ms |
| intro | 101.4 / 186 ms | 101.9 / 205 ms |
| hunt | 103.5 / 120 ms | 103.9 / 109 ms |
| judge | 70.4 / 284 ms | 100.2 / 220 ms |
| stand | 99.0 / 139 ms | 104.6 / 47 ms |
| brag | 101.1 / 169 ms | 104.8 / 38 ms |
| show | 101.9 / 216 ms | 104.6 / 47 ms |
| champ (finale) | 74.5 / 113 ms | 100.2 / 82 ms |

Both VVD games passed all three rounds and the finale. The after game had 27 Polly lines
and 0 audio errors.

### Lead's questions from Nick's video (stick check pending)

1. **Countdown digit.** Lead's opacity-swapped rasters (4501089) are in the next build. The
   verdict run passes through the countdown, but whether the digit shows needs one stick
   screenshot during "GET READY". Pending.
2. **Pink edge band on the GO FIND IT wipe.** Not yet checked on the stick. In the baseline
   the countdown→hunt transition had 1.8 s presentation stalls (intro/countdown max gap
   1768 ms, with a wipe motion table and an SFX load in it), so a wipe frozen mid-way for
   over a second is consistent with the data. Pending a stick check after the fixes.
3. **Black feed tiles at hunt start.** TV side is fast: on the VVD the first feed thumbnail
   is decoded 16 ms after the hunt starts (`feed-base64`, 0–4 ms each). With synthetic
   phones that send thumbnails from the first `cam` screen, tiles fill immediately. So the
   seconds of black most likely come from real phones still starting their cameras (first
   thumbnail not yet sent), plus the baseline's JS stalls at that moment (hunt/hunt max gap
   1.9 s). A non-black "camera starting" placeholder per tile is a design call for the lead.

## Merged run · 21:08 ET · lead host/HUD fixes (9205cd4) · no trace

The stick dropped off USB during this run, so the profiler could not pull its trace. Its
telemetry still shows the same SFX blocking: 163 `src` swaps, 27.5 s, max 580 ms. The app
stopped responding at round-2 standings (no telemetry for 259 s, then a fresh app start).
The native report was not retrieved. Host/HUD per-scene numbers need the next stick run.

## Baseline · 2026-10-20 20:56 ET · `w/stick-accept` 7ae90bb (before lead host/HUD fixes)

Package `tv_armv7-opus-baseline.vpkg`, SHA-256 `58171162…a04a8a`. Stick rebooted 25 min
earlier; audio worked (13 Polly lines, 0 audio errors).

**Outcome: the app was killed in round 3 (show/tally), about 370 s in.** Native report:
`AppNotResponding`, Thread Monitor, thread `JSReactThread`. The last telemetry before the
kill is `native-set-src` → `native-load` on SFX player `audio-1`, with no return.

| Scene | fps | p95 frame ms | max gap ms | gaps >100 ms | seconds |
|---|---|---|---|---|---|
| lobby | 22.81 | 54.3 | 98.6 | 0 | 5.31 |
| intro | 16.78 | 166.7 | 1788.4 | 115 | 91.82 |
| hunt | 8.74 | 783.8 | 1936.4 | 137 | 98.77 |
| judge | 1.15 | 1034.4 | 1051.1 | 35 | 30.53 |
| stand | 6.42 | 1018.2 | 1352.6 | 25 | 21.64 |
| brag | 8.62 | 1066.6 | 1668.9 | 94 | 76.33 |
| show | 10.23 | 348.1 | 2423.4 | 27 | 28.54 |
| **whole game** | 10.56 | 755.7 | 2423.4 | 447 | 370.07 |

| Phase | fps | p95 ms | max ms | >100 ms |
|---|---|---|---|---|
| lobby | 22.81 | 54.3 | 98.6 | 0 |
| intro/title | 20.43 | 76.4 | 1335.2 | 40 |
| intro/reel | 13.39 | 259.0 | 1788.4 | 34 |
| intro/countdown | 13.43 | 281.1 | 1768.5 | 41 |
| hunt/hunt | 8.56 | 817.2 | 1936.4 | 109 |
| hunt/glow | 9.53 | 651.4 | 1818.4 | 14 |
| judge/judge | 1.17 | 934.8 | 984.4 | 30 |
| judge/winner | 1.01 | 1051.1 | 1051.1 | 5 |
| stand/standings | 5.75 | 1034.5 | 1352.6 | 22 |
| brag/brag-intro | 10.34 | 1034.5 | 1668.9 | 25 |
| brag/brag-lines | 7.44 | 1067.9 | 1134.2 | 17 |
| brag/mash | 7.81 | 1067.5 | 1435.2 | 24 |
| brag/knockout | 8.23 | 1067.9 | 1104.9 | 16 |
| show/runway | 10.68 | 200.5 | 2423.4 | 13 |
| show/vote | 10.46 | 348.1 | 1467.9 | 7 |
| show/tally | 8.8 | 1300.7 | 1305.7 | 3 |
| show/winner | 9.52 | 1234.7 | 1351.3 | 4 |

Frame rate decays from ~45 fps (first seconds of the intro) to ~9 fps by the hunt, and
stays there; judge renders about one frame a second.

**JS-thread blocking native calls in this game** (diagnostic `native-work` telemetry):

| Call | count | total ms | p50 | p95 | max |
|---|---|---|---|---|---|
| SFX player `src` setter (runs a synchronous native load) | 215 | 33,230 | 118 | 338 | 835, then one that never returned (the ANR) |
| Polly `srcObject` (MediaSource attach) | 17 | 4,798 | 214 | 708 | 708 |
| Polly `addSourceBuffer` | 17 | 2,522 | 126 | 364 | 364 |
| Backdrop video `src` (mood change) | 6 | 2,048 | 386 | 726 | 726 |
| particle frame build | 576 | 7,739 | 6 | 49 | 263 |
| motion tables (scene entrances) | ~600 | ~17,000 | 15–40 | 50–200 | 515 |

Raw traces and the native crash report stay outside git (`/tmp/snag-opus-*`).

**Audio `code: 3`.** The previous worker's errors (`Failed to initialize audio stream`,
novaaudiosink) occurred in every app session before the stick's 20:31 reboot and in none
after it, including this game. That points to device-level audio-stream exhaustion that
accumulated across many killed app instances, not the codec or the files (relaunch check
pending below).
