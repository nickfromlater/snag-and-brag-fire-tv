# Phone worker handoff · 2026-10-12

Branch: `w/phone`. No shared protocol, constants or Pixel Judge changes.

## Built

- All nine screens, ported markup/CSS, bundled fonts and OFL licenses, byte-identical
  SVG art/filter/reaction symbols, spring transitions, pendulum eyes, PFX confetti,
  press states, rolling awards, haptics, host controls and pause overlay.
- Rear camera, 720×720 JPEG q .8, shared 480×480 Pixel Judge, 96×64 JPEG previews
  at 3 fps, stop/reacquire lifecycle, denied/unsupported-camera file fallback,
  embedded-browser detection and copy link.
- Glow-up choices survive late AI and reconnects; default eyes and current choices
  auto-send at the deadline. One vote locks. Reactions use a six-per-second sliding
  limit. Spectator taps retain separate side counts and batch every 100 ms.
- Same-origin WebSocket, development override/proxy, 128-bit per-room reconnect
  token, ping/pong sync, 250–2000 ms backoff, visibility/pageshow/reload recovery,
  no-store photo fetches, room-close cleanup and motion-permission fallback.
- Local scripted three-round TV (`?fake=1`), nine-frame gallery, screenshot comparison,
  camera/relay browser smoke tests and LAN HTTPS command.

## Run and review

See [phone/README.md](../../phone/README.md) for commands and physical iPhone/Android
test steps. Quick path: `pnpm --filter phone dev`, open
`http://localhost:5173/?fake=1`. Review: `/?gallery=1`. Build:
`pnpm --filter phone build` → `phone/dist`.

Evidence:

- [phone-compare.png](phone-compare.png): this branch left, reference right, all nine
  screens. Individual `phone-01-join.png` through `phone-09-end-card.png` are alongside it.
- [phone-smoke.json](phone-smoke.json): every screen and three rounds, three 720×720
  snags, Color Rush match 99, non-color match 0, 96×64 previews, two-second AI reads,
  selected-name preservation, auto-send/default eyes, reaction throttle, mash batch,
  vote lock, pointer tilt, restart and in-memory file fallback.
- [phone-edges.json](phone-edges.json): actual WebSocket framing and recovery, one
  reconnect token across six connections, camera sleep/pause cleanup, host recovery
  after reload, a five-second clock offset, no-store HTTP photo fetch, room-close cleanup, taken
  colors/full room, stale screens, embedded browsers, unsupported camera, mocked
  granted/denied iOS motion permission, spectator input, noisy JPEG byte budget,
  urgent timer colors and LAN HTTPS secure context.
- [phone-checks.txt](phone-checks.txt): root tests, root typecheck and production build.
  There are 23 phone tests and 5 shared tests. Production HTML/JS/CSS is about 36 KB
  gzipped, excluding fonts, below the 250 KB target.

All automated captures and media are synthetic. No player photos or thumbnails
were saved, logged or transmitted to a paid API. The temporary Y4M is deleted.
System Chrome is launched with `--mute-audio`; the phone has no audio implementation.

## Every adaptation / decision

1. The live camera replaces the cartoon house. Zone buttons and the drag hint are
   removed as required. The gallery camera uses an in-memory synthetic scene, and
   its location pill says “Your camera.” The friendly shutter-side hint is
   “Aim. Snap. Make it a star.” The existing file button says “Choose photo.”
2. The join instruction replaces “Rival teams can grab it first” with “Fastest snag
   earns a bonus.” Real objects cannot be locked, so the original copy is inaccurate.
   The no-code entry says “Two to four teams.”
3. The requested bots toggle, host menu, lobby badge/score, pause overlay and privacy
   line are additions to the reference. End-screen gap is 8 px rather than 12 px so
   the privacy line and Run it back fit. Non-host lobby copy waits for the host.
4. The gallery uses the mockup's exact 372×820 logical layout normalized to the
   requested 390×844; references are normalized to the same dimensions. The notch
   and rounded shell are gallery-only. Live mobile uses viewport/safe-area sizing
   and scrolls when necessary. Gallery sticker fan/taps are deterministic, and
   infinite CSS animations pause for layout capture; normal play animates them.
5. Smooth synthetic previews encode below the approximate 2–4 KB target (the fake
   scene is about 1.1 KB). They are genuine 96×64 JPEGs, never padded. Noisy previews
   reduce quality if needed and are capped at 4096 bytes.
6. `ScreenMsg` only identifies the host in lobby/end screens. A second localStorage
   identity tag associates host status with the same reconnect token, so a reload
   during a hunt can restore the menu without changing the shared contract. The TV
   remains responsible for authorizing every control. No game state or media is
   persisted. An authoritative join screen clears stale host identity.
7. The default same-origin relay path is `/ws`; a development override replaces the
   complete URL. `total` uses milliseconds, matching the wire's deadline units.
   The other workers should preserve these integration assumptions.
8. Keyboard start also requires the 850 ms hold. The mockup's keyboard shortcut
   started immediately; the brief makes hold-to-start binding.
9. The dev HTTPS certificate is untrusted, as `@vitejs/plugin-basic-ssl` specifies.
   The automated Chrome check accepts it. A trusted certificate is required for
   production and for any phone/browser that rejects its camera permission.

## Unverified / remaining integration

Implementation and automated checks are complete. No real iPhone or Android phone
was available to this worker. Actual Safari motion prompts, device vibration,
camera behavior, browser certificate handling and safe-area behavior need the
written physical-phone check. The relay and TV workers were not merged here;
the actual-network test uses a local protocol-compatible stand-in, not AWS or a
Fire TV. Household play and AWS/TV integration remain with the lead.

## Amazon / AWS friction

None: this worker used no Amazon/AWS SDK, tool, service, account or paid API. There
is no Amazon friction entry to claim. A pnpm 12.10.1 install papercut is recorded
separately in `FRICTION.md` with its exact error and workaround.
