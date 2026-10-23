# Phone controller

Plain TypeScript + Vite, using `@snag/shared` without changing its wire contract.
The TV owns every phase, timer, roster and score. The controller keeps the current
screen, identity and local input. It never saves photos or thumbnails and makes no
AI calls. Audio comes from the TV; this page only requests haptics.

## Run

From the repository root, using the Node version in the worker brief:

```sh
export PATH=$HOME/.nvm/versions/node/v24.20.0/bin:$PATH
corepack pnpm install
corepack pnpm --filter phone dev
```

- `http://localhost:5173/?fake=1`: join, hold the yellow button, and play all three
  rounds against the local scripted TV. Camera capture, Pixel Judge and binary
  framing are real; the TV, AI and photo URLs are in memory in this browser.
  AI suggestions arrive after two seconds. The host menu supports skip, pause,
  resume and end. Run it back starts another game.
- `http://localhost:5173/?gallery=1`: nine fixture screens side by side, each
  390×844. These use SVG bot finds and a synthetic camera scene.
- `http://localhost:5173/`: four-letter room-code entry.
- `http://localhost:5173/?r=ABCD`: real relay mode, one controller WebSocket to
  the same origin at `/ws`.
- `?r=ABCD&relay=ws://localhost:8000/ws`: full development relay URL override.
  Photo requests use that relay's HTTP origin. A cross-origin relay must allow
  the phone origin with CORS. Same-origin proxying avoids that requirement:

```sh
PHONE_RELAY_URL=http://localhost:8000 corepack pnpm --filter phone dev
```

`fake`, `fast`, `gallery`, and `fixture` are development-only. They are removed
from the production JavaScript. `fast=1` shortens scripted choreography for tests;
AI reads still take two seconds and capture/mash/vote deadlines stay real.

## Checks and screenshots

Keep the HTTP dev server running, then in another terminal:

```sh
corepack pnpm test
corepack pnpm typecheck
corepack pnpm --filter phone smoke
corepack pnpm --filter phone shoot
corepack pnpm --filter phone build
```

`smoke` uses the installed system Chrome with `--mute-audio`, fake camera flags
and a temporary generated Y4M. It plays a complete three-round game, tests the
file fallback using a synthetic `File` generated in browser memory, and checks
the actual WebSocket path with a local stand-in relay. Payloads stay in memory;
the Y4M is deleted. Receipts contain headers, dimensions, byte counts and results,
never media bytes or reconnect tokens.

`shoot` always captures synthetic gallery fixtures. It writes the nine screen
PNGs plus [phone-compare.png](../docs/review/phone-compare.png), this branch on the
left and the approved mockup on the right. Both sides are normalized to 390×844
from the mockup's 372×820 logical phone layout / 465×1025 reference PNGs.
Infinite CSS animations are paused for stable layout comparison; googly-eye
physics and holographic motion remain live in normal play.

Build output is `phone/dist` (gitignored). Serve its files and `/ws`, `/p` on the
same HTTPS origin. There is no service worker or image cache. Photo fetches use
`cache: 'no-store'`; the relay must also return `Cache-Control: no-store`.
`ScreenMsg.total` is a duration in milliseconds. All deadlines are absolute
relay-clock milliseconds, rendered through `ClockSync`.

## HTTPS and physical-phone testing

Stop the HTTP server first if using the default port:

```sh
corepack pnpm --filter phone dev:https
```

Vite prints the Mac's LAN URL, such as `https://<LAN-IP>:5173`. The plugin
generates an untrusted development certificate under gitignored `node_modules`.
Visit the URL directly and proceed through the development certificate screen.
Production requires a trusted HTTPS certificate and WSS. If a mobile browser
refuses live camera access with this development certificate, test the file
fallback and repeat the live-camera test on the trusted deployment.

To keep both servers running for the automated HTTPS check:

```sh
corepack pnpm --filter phone dev:https --port 5175
PHONE_HTTPS_ORIGIN=https://localhost:5175 corepack pnpm --filter phone smoke
```

For LAN coverage, set PHONE_HTTPS_ORIGIN to the Network URL that Vite prints. Chrome's automated
HTTPS check explicitly accepts the development certificate; it is not proof of
Safari or Android certificate behavior.

### iPhone Safari

1. Connect the iPhone and Mac to the same Wi-Fi. Open the printed HTTPS URL with
   `/?fake=1` directly in Safari. Embedded Instagram/Messenger browsers show
   “Open in Safari/Chrome” and a Copy link button.
2. Join and hold to start. Allow camera access when hunting starts. Check that
   the rear camera fills the viewfinder, the REC indicator and brackets remain
   visible, and the shutter captures the center square without stretching it.
3. Snag a red object. Check the die-cut photo, tap two eyes, pick a name before
   the AI read arrives, and confirm that your pick stays selected. Let one
   glow-up deadline expire to check auto-send and default eyes.
4. During a hunt, lock the phone for 20 seconds, return to Safari, and confirm the
   camera resumes only if hunting is still active. With the real relay/TV, also
   check that you return to the TV's current screen with the same team and score.
5. Reload during the hunt and confirm host controls remain available. Pause and
   resume from the host menu; the camera should stop while paused.
6. Deny camera access on a fresh run and use Take or choose a photo. Check both a
   portrait and landscape image. Neither should stretch in its square crop.
7. On the end card, tap to grant motion access and tilt the phone. Repeat with
   motion access denied; dragging a finger over the card should still tilt it.
   Check safe areas, scrolling, and that Run it back can be reached.

Safari may not expose `navigator.vibrate`; the controller remains silent and
playable. This is an API capability check, not a reason to add audio.

### Android Chrome

1. On the same Wi-Fi, open the printed HTTPS URL with `/?fake=1` in Chrome and
   allow camera access. Check rear-camera selection and the viewfinder crop.
2. Play all three rounds. Mash repeatedly with `pointerdown`, check that a
   fighter cannot mash the rival, and that rapid voting locks one selection.
3. Check haptics on the four start-hold ticks, shutter, eyes and reactions if the
   device/browser exposes vibration. Check that double tapping does not zoom.
4. Background Chrome or lock the phone for 20 seconds mid-hunt. Return and check
   current-screen recovery and camera reacquisition. Repeat with Wi-Fi briefly
   disconnected when using the real relay/TV.
5. Repeat with camera permission denied and a portrait/landscape file selection.
   Try the trading-card tilt, pause/resume, end game and Run it back.

Do not record, export or screenshot player photos during these checks. Automated
review artifacts use synthetic fixtures only. Physical iPhone and Android tests,
and integration with the other workers' TV and relay, still need a human run.
