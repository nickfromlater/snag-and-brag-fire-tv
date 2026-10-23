# Native SFX correction · 2026-10-13

The apparent decoder failures were native audio-stream allocation failures. The old
engine limited active voices to eight, but created/retained media players per effect.
Paused players still consumed native resources. The full-bank control passed 90/112
ids before later-created banks failed with 33 media errors. Native `loggingctl` showed
shared-memory allocation error -12, “Cannot allocate memory,” an audio sink unable to
create its stream helper, and then a misleading “stream is in the wrong format.”

A fresh-launch control played five of those same failed files successfully:
`sfx-mtick-0000`, `sfx-riser-1p2`, `sfx-thump`, `sfx-scan`, `sfx-reveal`.
They span roughly 70 ms through 1.2 s. This reproduces resource exhaustion rather
than a minimum decoder duration or an unsupported sample rate/format.

The correction reuses eight SFX media players across all asset ids and variants,
plus two music players. Initialization is shared even when cues or preloads overlap.
The eight-voice/retrigger/oldest-voice policy and reference asset selection remain.
No audio asset was re-encoded, padded, normalized or regenerated; all 118 audio
files in each codec remain byte-identical to the existing render-audio manifest.

Reproduce while holding `~/.snag-vvd.lock`, with the Mac muted:

    source ~/vega/env
    export PATH=$HOME/.nvm/versions/node/v24.20.0/bin:$PATH
    pnpm --filter @snag/tv build:release --target aarch64 --use-system-js-bundles true --max-workers 2
    vega device install-app --packagePath tv/build/aarch64-release/tv_aarch64.vpkg
    vega device launch-app --appName com.snagbrag.tv.main
    node tv/tooling/verify-audio-native.mjs ogg native-audio-effects

Run the local mock relay and `node tv/tooling/control.mjs`, reversing the device's
8787/8790 to their local relay/control ports. The native receipt covers all 112 SFX
ids twice: selection and immediate same-file replay. It requires advancing player
time, an ended event, zero media errors, native Hermes telemetry, and at most ten
players. This is decoder/playback-state evidence on the aarch64 VVD, with no claim
of an acoustic measurement or physical armv7 device test.

Evidence: `native-audio-ogg-baseline.json`, `native-audio-ogg-fresh-subset.json`,
`native-audio-effects.json`, `finish-tests.txt`, `finish-typecheck.txt`.
