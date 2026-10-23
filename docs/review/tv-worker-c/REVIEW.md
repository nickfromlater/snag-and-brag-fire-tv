# Worker C: Brag-Off, Showstopper, champion

The three scene components render the shared `TvView` and its semantic motion targets.
All decisions, deadlines, score awards, match order and effects remain in the shared core.

Run the web target from the repository root with Node 24:

```sh
export PATH=$HOME/.nvm/versions/node/v24.20.0/bin:$PATH
pnpm --filter @snag/tv assets
pnpm --filter @snag/tv dev --port 5176 --strictPort
SCENE_C_SPEED=10 node tv/tooling/verify-worker-c.mjs synthetic
```

The relay must run locally on 8787 with `AI_MODE=mock POLLY_MODE=mock`. The verifier
generates three colored object JPEGs in memory, sends the real relay binary-photo
protocol, dresses the finds, mashes and votes. It isolates its web control connection
from other workers’ VVD commands. It persists only synthetic captures and filtered
metadata. `web-synthetic-check.json` records the full game, zero exceptions, all three
relay photos, frozen pause, and centered 0/1/2/3-find layouts and vote anchors.

Generic stage additions are `Follow`, `Loop`, `HolographicSticker`, `Sheen`, optional
absolute anchors for nested `Box`/`Motion` targets, timer styling, badge outline/type
sizes, and optional eyes on `FindSticker`. Tests cover loop time, anchor coordinates,
memory-only photo fetching and browser/native SVG image-source compatibility. Existing
native bitmap sources and the original object art remain unchanged.

Native acceptance requires the shared `~/.snag-vvd.lock`, an installed aarch64 release,
and `node tv/tooling/verify-worker-c-native.mjs`. It uses a private control server on
8796 (override with `SCENE_C_NATIVE_PORT`), routes device tcp:8790 there, verifies a
complete all-bot game, and records the complete C scene beats at requested 60 fps with
three synthetic relay photos. The Mac stays muted. No SDK, browser, or asset download
is needed. Keep the VVD process alive after acceptance.

Native acceptance remains blocked. After integrating the foundation’s generic native
container/world-effect correction, the final speed-3 retry stopped in round 1’s reel
before the C scenes with 275 contiguous cues and no reported JS exception. It timed
out. A guaranteed fresh screenshot still displays the startup UI. See
`native-foundation-retry.json`, `native-runtime.jsonl`, and
`native-foundation-diagnostic.png` and the dated entry in `FRICTION.md`.

The console expects a screenshot directory. The verifier now uses a fresh temporary
directory, checks exactly one new PNG and fails on console KO errors. The earlier
`native-all-bots.json` records a 951-cue, zero-exception engine completion for the
preceding candidate; its screenshot is not visual acceptance of the final candidate.
The six native scene screenshots, three comparison sheets and three clips remain
incomplete. Web images are iteration evidence.

Adaptations: the final CSS overrides take precedence; small labels increase to 16 px;
missing-find/bye states use matching paper cards and panels; holography uses masked
rainbow passes rather than browser CSS filters. See the dated Worker C entry in
`DECISIONS.md`. The shared core’s Showstopper confetti now resolves the actual winner
pedestal anchor so it remains centered after a dropout.


## Native follow-up, 2026-10-13

Before the foundation correction, the aarch64 release included native-worklet Follow and Loop primitives. That candidate’s normal-effects speed-3 native all-bot run completed with 951 contiguous cues and zero exceptions (`native-all-bots.json`). The displayed screenshot (`native-all-bots-finale.png`) still retains the bootstrap screen, so native visual acceptance remains blocked. Do not use this image as a champion acceptance shot. Native comparison sheets and the three clips are not complete.

The independent web receipt in `../worker-c/web-receipt.json` verifies four teams, all three synthetic relay photos (HTTP 200), all six C scene states, and zero rendering/relay exceptions. Root tests/lint/typechecking pass; TV primitive tests/typechecking also pass after the worklet change. No protocol shape or show schedule changed.


## Final validation after foundation correction, 2026-10-13

The latest isolated web game completed all eight scenes with four teams, three
synthetic JPEGs uploaded and fetched over the relay (HTTP 200), all six C captures,
and zero exceptions/errors. The receipt and fresh images are in `../worker-c/`.
Root `pnpm test`, `pnpm lint`, and `pnpm typecheck` pass. The aarch64 release build
passes. The final native retry remains a failed acceptance attempt as detailed above.
The Mac stays muted and the VVD stays running after release of the C lock.
