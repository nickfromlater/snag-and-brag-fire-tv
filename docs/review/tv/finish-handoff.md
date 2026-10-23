# TV finish handoff · 2026-10-13

Steps 1, 3 and 4 are delivered. G2 remains blocked by a native runtime/presentation
stall, so this worker does not claim the requested full native phone-game acceptance.
The final standard-effects run stopped at round 0 judge, cue 222, after 78.025 seconds,
with no reported native exception or media error. The phone's full-game assertions
were not reached. `g2-native-e2e.json` records `pass: false`.

- SFX: `abdfcdc` bounds retained native instances to eight SFX plus two music
  players. All 112 exact ids ended and advanced on first selection and immediate
  replay: 224/224 passed, zero decoder/media errors. No reference audio bytes,
  gains, durations or codec changed. See `native-audio-effects.json` and
  `native-audio-diagnosis.md` for controls and the resource-allocation diagnosis.
- Phone/native reveal: `16fb5d6` fixes the native photo crop and mask alignment,
  preserves the sticker art and web SVG path, and retains failing-run evidence.
  `g2-native-mask.png` and `../tv-g2-color-rush-reveal.mp4` show the actual synthetic
  phone photo and red mask. The silent H.264 clip is 20 seconds, 1920×1080, 60 fps,
  1.63 MB. This evidence proves the reveal, not completion of all three rounds.
- Review: `8033388` adds the seven requested native comparison sheets plus a
  lobby sheet, and the three native round clips at 7.63, 9.56 and 9.42 MB. Their
  original integration-worker provenance is explicit in `native-scene-acceptance.json`
  and `native-review-provenance.md`. All artifacts are below 10 MB. The native
  source screenshots remain the already-committed integration captures.
- armv7: build and copy metadata, exact paths, size and matching SHA-256 hashes
  are in `armv7-integrated-build.json`. The output is also copied to
  `~/builds/snag-and-brag/tv_armv7-integrated.vpkg`. The package stays outside git.
  No physical armv7 device test was available or claimed.

## Run and reproduce

    export PATH=$HOME/.nvm/versions/node/v24.20.0/bin:$PATH
    pnpm install --frozen-lockfile
    pnpm test
    pnpm typecheck
    source ~/vega/env
    pnpm --filter @snag/tv build:release --target armv7 --use-system-js-bundles true --max-workers 2

For native verification, keep the Mac muted and hold `~/.snag-vvd.lock` with a live
keeper. Build/install the same release for aarch64, run `node tv/tooling/control.mjs`,
and start the local relay with `AI_MODE=mock POLLY_MODE=mock`. This finish pass used
host port 8789, leaving the existing relay on 8787 alone:

    HOST=127.0.0.1 PORT=8789 PUBLIC_URL=http://localhost:8789 AI_MODE=mock POLLY_MODE=mock pnpm --filter relay start
    vega exec vda reverse tcp:8787 tcp:8789
    vega exec vda reverse tcp:8790 tcp:8790
    node tv/tooling/verify-audio-native.mjs ogg native-audio-effects
    TV_JOIN_ORIGIN=http://localhost:8789 node tv/tooling/capture-native.mjs g2
    node tv/tooling/compare-scenes.mjs

The G2 harness invokes the requested headless phone command with a real fake-camera
browser; all image handling remains synthetic and in memory. It now saves a failed
receipt and partial clip when snapshots stop. It exits nonzero on the current stall.

## Verification, differences and cleanup

Root tests passed all 361 cases across seven packages, including the meaningful
pool-initialization/resource tests; root typecheck passed. Exact output is in
`finish-tests.txt` and `finish-typecheck.txt`. Native effect verification requires
advancing time, an ended event, zero errors and at most ten retained players. Clip
metadata and frame inspection verified silent H.264, 1080p60 and the 10 MB ceiling.

The native photo uses a rounded Image crop instead of SVG Image+Mask to avoid the
observed attachment failure. Its 10/120 inset, 100/120 bounds and 20/120 radius come
from the reference; shadow/border/eyes and the web implementation remain. A
redundant overlay scale was removed, preserving the complete 24×24 photo coordinates.
Comparison panes differ in seeded prompt, objects, three-versus-four team count,
score and motion phase; these are documented in the provenance file. No wire-protocol
shape or core-game contract changed. AI and voice were mocked; Mac output stayed muted.

Vega friction is appended to `FRICTION.md` as F-TV-FINISH-01 through -04: audio sink
allocation masquerading as decoder failure, the unresolved native stall, and the
remote Perfetto-analysis request rejected by automatic approval review, and the
alternate local-SDK-bundle build that also stalled before phone launch. Its isolated
receipt is `g2-private-bundles-diagnostic.json`; the standard aarch64 configuration
was restored. Local
analysis used the installed offline trace processor; no trace was exported.

The app and worker-owned VVD, mock relay and control server were stopped; the VVD
lock was released. No main/push/rebase or shared lead-owned status files were changed.
The supplied untracked `docs/workers/tv-finish.md` was left alone.
