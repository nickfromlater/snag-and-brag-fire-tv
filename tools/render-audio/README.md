# Offline audio renderer

Render the approved mockup's sounds without playing them. The build runs its original
audio code in headless system Chrome, writes 48 kHz stereo PCM16 WAVs and Vorbis q5
copies, measures the actual WAVs, and creates review images.

## Run

From the repository root, with Node 24 and pnpm 10+:

```sh
export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH"
pnpm install
pnpm --filter render-audio build
pnpm --filter render-audio verify
pnpm test
pnpm typecheck
```

The renderer uses `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` and
`/opt/homebrew/bin/ffmpeg` (with `libvorbis`, `ebur128`, and `showspectrumpic`), plus the
adjacent `ffprobe`. It installs `puppeteer-core`, which never downloads a browser.
Override paths with `RENDER_AUDIO_CHROME` / `RENDER_AUDIO_FFMPEG`. Override the unsigned
32-bit seed with `RENDER_AUDIO_SEED` (default `0x534e4147`). Equal source, seed and tool
versions produce identical outputs; changing Chrome's DSP or ffmpeg can change bytes.
The manifest records versions and source hashes.

`build` stages all outputs in a temporary directory, publishes only after every render
and check succeeds, and removes its temporary buffers/images/profile. `verify` performs
the same full build into a temporary directory, compares every output byte to the
existing files, and leaves those files intact. Re-run `build` when the source, tool
versions or seed change. No network service or audio playback is needed.

Outputs:

- `assets/audio/*.wav`: 112 effects, six loops.
- `assets/audio/ogg/*.ogg`: a Vorbis q5 copy of each WAV with the same sample count.
- `assets/audio/manifest.json`: parameters, seeds, call sites, hashes, sizes, duration,
  sample peak, RMS, integrated loudness and music bar/seam metadata.
- [assets/audio/README.md](../../assets/audio/README.md): the complete generated call-site table.
- [docs/review/audio](../../docs/review/audio/README.md): six spectrograms, waveform grid and checks.

## Unchanged source and offline adapter

The local page loads the exact bytes from `var AU=` through the end of `MUS` in
`reference/src/game.js`. This includes `ac`, `T`, `osc`, `nz`, `bell`, every `SFX`
definition, and the later `SFX.boom` and `SFX.ko` additions. A TypeScript AST scan checks
that every definition and every call/callback has an asset; nested `this.shutter()` and
`this.crowd(2,.18)` are included. The browser response itself is checked for byte equality.
There is no replacement synthesizer and no modified copy of `game.js`.

The small adapter in [src/adapter.ts](src/adapter.ts) makes these necessary changes to
execution only:

1. Seed `Math.random` with Mulberry32 before `ac()` builds the impulse/noise buffers and
   before any effect parameters or music noise offsets are selected; restore it afterward.
   Each asset gets an independent stable seed derived from its id.
2. Temporarily make the constructor used by `ac()` return a proxy around a real
   `OfflineAudioContext`. The proxy reports `running` only during initialization, so
   `ac()` does not call the offline context's incompatible realtime `resume()` path.
   Other methods forward to that context. The source initializer creates its exact graph,
   including master .9 → compressor (-12 dB, 4:1) → destination, SFX .8, music .22,
   1.2-second stereo cubic-decay noise impulse, convolver normalization and .18 wet return.
   Compressor knee/attack/release retain the source's Web Audio defaults.
3. Temporarily disable `MUS.start` during initialization. Render music by calling the
   untouched `MUS.play(step,time)` 192 times at exact scheduled timestamps, never using
   an interval. Switch through `off` before selecting the mood so lobby gets the brief's
   102 bpm; the source initially declares 104 and `set('lobby')` otherwise returns early.
4. Record the source's connections, then route junctions with more than two inputs through
   balanced unity-gain binary sums. Repeated unadapted composite renders differed by a
   single PCM16 count despite identical seeds. This is consistent with Chromium copying
   pointer-hash connection order into its rendering list and accumulating in that order
   ([connection storage](https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/modules/webaudio/audio_summing_junction.h),
   [summing implementation](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/modules/webaudio/audio_node_input.cc)).
   The added unity nodes have no delay, envelope or filtering; original synthesis nodes,
   parameters, buses, master compressor and reverb remain intact. This execution adapter
   fixes addition order rather than quantizing, dithering or changing the sounds. Each
   asset records its junction/node counts. Four repeated fanfare, snagged, slam and lobby
   probes plus full regeneration check the resulting byte stability.
   `docs/review/audio-summing-delta.json` records the pre-makeup comparison of all 118
   files to the seeded unadapted graph: unchanged sample counts, with at most a one-count
   PCM16 difference in 52 interleaved samples across 13 files (about -90.3 dBFS). The
   manifest's `sourcePcm16Sha256` identifies this unboosted source separately from the
   boosted file hash.

Realtime constructors throw before the source loads and again immediately after graph
initialization. `setInterval` throws. Chrome always starts with `--mute-audio`. Browser
requests are limited to localhost and image data URLs, with CSP disabling connections
and media. Review uses analysis and images only.

## Rendering, loops and measurement

Effects render into six-second buffers. Preserve the attack and trim after the last
sample at or above -60 dBFS on either channel, plus 2,400 samples (50 ms). Keep all source
envelopes and tails; never normalize individual files or add a fade. The render fails if it is silent,
clipped, nonfinite or too short for the required tail.

After rendering the complete bank, compute one makeup gain from its greatest absolute
float sample so the loudest file peaks at **-3.0 dBFS**. Apply this exact same linear gain
to every retained effect/music sample before PCM16 quantization, then derive Oggs and all
statistics/images from those boosted WAVs. The gain is recorded in `mix.makeupGainDb`
and the generated `assets/audio/README.md`; `sourcePeakDbfs` and `sourcePcm16Sha256`
retain the pre-makeup reference. Durations, trim points, loop/bar boundaries and relative
file levels remain unchanged. There is no added compression, limiting or per-file
normalization. This uniform export gain is authorized by the lead's 2026-10-12 review.

Music renders three full four-bar loops at the source timestamps and cuts the middle
one. This preserves the original release tails, compressor state and any reverb from
the preceding loop. Some BPMs imply fractional sample counts: round the absolute start
and end sample boundaries, without stretching, resampling or crossfading. The manifest
records the exact length, ideal fractional length, middle-loop start/end, and all five
bar boundaries including the endpoint. TV mood changes should use those sample offsets;
each subsequent loop starts at the actual integer length. Rounding differs from ideal
tempo by less than one sample per loop.

Check each channel's wrap jump against the largest adjacent-sample jump within 50 ms on
either side. A larger wrap fails the build. Spectrograms analyze each **committed PCM16
file repeated three times**, with unobscured seam markers above and below the plot.
The output retains the original middle-loop timing with the one shared makeup gain;
there is no seam repair, crossfade or extra fade.

Peak, RMS and seam checks use quantized WAV samples. Loudness uses ffmpeg `ebur128`,
including its gates. Effects shorter than 400 ms cannot provide an integrated block and
usually report the -70 LUFS meter floor; the manifest marks `insufficient-duration`.
Other below-gate measurements are marked `below-gate`. These are not loudness targets.
Vorbis copies use bitexact container flags to remove random stream serial numbers;
`ffprobe` checks stereo/48 kHz/Vorbis and the exact granule sample count for every file.
Use WAVs for low-latency effects and gapless loops; platform Ogg decoder behavior still
needs device testing.

## Runtime mix and file selection

The original source render uses **SFX .8, music .22, master .9, reverb .18 wet**, with a
master compressor at -12 dB and 4:1. Those source gains and that compressor remain baked
into each file, followed by the uniform makeup gain above.

Per the lead's correction, **every file plays at unity gain (1.0)**, is summed at unity,
then passes through the TV's soft limiter. Reapplying SFX .8, music .22 or master .9
would attenuate gains already baked into the files (the music bus alone by about 13 dB).
`mix.runtimeBusLevels` and `mix.filePlaybackLevels` are all 1.0; the baked render chain
is separately recorded under `mix.graph`/`sourceRenderLevels`. Makeup is also baked in
and must not be applied again. The only runtime gain controls are Sound and Music
on/off (1.0/0.0), plus an optional user volume if added.

Rendering one sound at a time cannot preserve the original compressor's response to
simultaneous sounds: compression is nonlinear. The TV's soft limiter processes the
runtime sum; its threshold/knee control reduction. The exporter does not apply it.

The requested overlap aligns **music-win**, **sfx-fanfare**, **sfx-ko** and
**sfx-crowd-2-18** at sample zero, plays every track at unity, and sums signed samples
in float64 before the TV limiter. Shorter tracks contribute silence
after their end. This deliberately includes standalone crowd in addition to fanfare's
embedded crowd. Its pre-limiter peak, channel peak locations, channel samples above
full scale and stereo frames with any over-full-scale channel are recorded in `mix.runtimeOverlap` and
`docs/review/audio/runtime-overlap.json`, with the measured dBFS value in the generated
asset README. This is a measurement of the requested synchronous scenario, not a sum
of individual absolute peaks. Other timing offsets can produce different peaks.

For the default source/seed, the gain is **+10.93534137 dB (3.521819293883432×)** and the
boosted single-file maximum is **-2.99998782 dBFS**. The requested overlap reaches
**-1.28862966 dBFS at unity before the soft limiter**. Zero channel samples and zero
stereo frames exceed full scale; actual soft-limiter reduction depends on its knee
and threshold. `docs/review/audio-makeup-validation.json` compares every exported sample
against the preceding bank with the one shared factor: all source hashes and sample
counts match, and differences are within the PCM16 quantization bound.

| Effect | Selection from game state |
|---|---|
| pop | Hold quarters: 2, 4, 6, 8. Fan button: 2. Flying points: 4. Base file: 0. |
| beep | 0 for each countdown number; 1 for SNAG/GO. |
| mash | `n % 13` selects the supplied pitch sequence for tap count n. See limitation below. |
| react star / heart | Reaction count `% 10`, matching the source. |
| react flame / tomato | Cycle or randomly choose variants 1–3. |
| mtick | Clamp progress to 0–1, round `p*8`, select the matching eighth. The id suffix is p × 1000. |
| drumroll | 2.3 s for prompt reel; 1.4 s for vote result; 2.2 s for finale. |
| riser | 1.2 s for hunt urgency and standings. |
| crowd | Every .6 s during mash, choose the nearest supplied v to `.04 + abs(push)*.08`. Default = 1.6 s/.16. |
| crowd 2/.18 | Already embedded in fanfare; the standalone file must not be layered over fanfare. |
| boom | Cycle or randomly choose variants 1–3 for fireworks. |
| voice | Cycle or randomly choose variants 1–16 for host typing and brag bubbles. |
| Remaining effects | Use the single matching file, including composite shutter in snagged. |

All requested parameter values are rendered by the original function with those exact
arguments. The finite catalog follows the worker brief: `mtick` and the mash crowd
bed quantize otherwise continuous inputs. A further source limitation is that
`mash(n)` wraps only its pitched oscillator with `%13`; its noise filter keeps rising as
`1400+n*30`. Reusing the requested 0–12 files above tap 12 preserves the pitch but
restarts that noise rise. Matching unlimited tap counts would need additional files or
a changed TV design, outside this catalog brief. No source sounds were changed to hide it.

The three tomato files intentionally have identical PCM: that branch has neither noise
nor random parameters. `shutter` is normally nested inside `snagged`, `crowd(2,.18)`
inside `fanfare`, and `aww` / default `crowd()` have no call sites in this revision but
are still rendered as requested. No shared protocol or constant was changed.
