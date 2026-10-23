# Device gate 1: the Fire TV Stick 4K Select (Tue Oct 13)

The stick arrives Oct 13, 7–11 AM. This gate answers one question: **can native Vega
hold the frame rate on a 1 GB stick?** The answer decides Vega OS (planned) or Fire OS on
a Fire TV Stick 4K Max (fallback), so we get it the day the stick lands.

## Nick (about 15 minutes, at home with the Mac)
1. **Placement:** the stick on any TV or HDMI monitor **within USB-cable reach of the
   Mac**. Vega installs our build over USB only.
2. **Cable:** a USB **data** cable from the stick's power port to the Mac (USB-C on the Mac
   end). Check whether the stick's port is micro-USB or USB-C. A charge-only cable won't
   work. If the TV's USB port isn't needed, the Mac's port can power the stick.
3. **Setup:** pair the remote, join Wi-Fi, sign in with your Amazon account. Then
   **Settings > My Fire TV > About > Check for updates** and install updates until it says
   it's current (it ships with OS 1.1; our SDK needs 1.2).
4. **Developer mode:** Settings > My Fire TV > About, highlight the device name and press
   the center button **7 times**. Then Developer Options > **Developer Mode**. The TV
   shows a 6-digit code.
5. **Approve:** we run `vega devmode login` on the Mac; a browser window opens, and you sign
   in with your **Amazon Developer** account. We then enter the TV's code
   (`vega devmode enable-device --code <code>`) within 5 minutes. The stick reboots.

That's all. Everything after this is ours.

## Us
One guided script runs the whole session: `bash tools/device/session.sh` (from the repo
root). It finds the stick (the non-virtual device in `vega device list`), runs
`vega devmode login`, which Nick approves in the browser, asks for the TV's code, enables the
device and waits for the reboot, installs both builds, starts a local relay (mock AI and
voice until AWS lands) with reverse port forwarding, launches the benchmark app, then
switches to the real TV app. Receipts go to `docs/review/device/<timestamp>/`. **Nick can
leave once the code is entered.** Measurement is ours.

Builds:
- **Backup (proven, built Oct 12 22:55):** `~/builds/snag-and-brag/vegaspike_armv7.vpkg`
  (`com.snagbrag.spike.main`), the spike's benchmark app. Its workloads switch by remote
  (FF) or control socket: baseline, rays, 300 particles, 20 rotating stickers, full20
  (20 stickers, 4 live JPEG feeds at 3 Hz, particles, rays, music), full40.
- **Primary:** the real TV app's armv7 release (`TV_PKG`, default
  `~/builds/snag-and-brag/tv_armv7-eyes-verified.vpkg`, `com.snagbrag.tv.main`):
  the native-verified build (lobby with moving eyes, a full all-bot game), replaced by the
  integrated build once it passes native verification. It has the remote debug menu with the same
  workloads.

**Real phones on the stick before AWS:** camera access needs HTTPS. `brew install
cloudflared`, then `cloudflared tunnel --url http://localhost:8787` (a free, account-less
quick tunnel), and restart the relay with `PUBLIC_URL` set to that URL. The TV's QR code
then works for real phones.

## Protocol
1. Verify the OS version (1.2+) and the app's launch time.
2. For each workload, five 24 s runs (the first 4 s dropped) plus native traces with
   `vega exec perf record`, analyzed through the Builder Tools MCP (render frames/s,
   frame-span p95/p99, render work ms, RSS).
3. A 10-minute soak of full20 with the feeds running: memory growth, any decode backlog,
   any crash.
4. Input latency: remote press → spring start (screen recording or trace markers), and
   the Back confirm.
5. Audio on the stick's HDMI: music plus overlapping effects, trigger timing by the
   player state (we can listen on the TV, not the Mac).

## Decision rule
- **Green, Vega:** full20 holds **≥ 30 fps with no sustained dips** as is. Production
  then follows the spike's rules (baked background, 30 Hz background and particles,
  60 Hz sticker transforms) to reach for 60.
- **Amber:** full20 below 30. The TV worker gets **one focused day** (to the end of Oct 14)
  to apply the rules and re-measure with the real foundation build.
- **Red, Fire OS:** still below 30 after that day. Switch to native Fire OS on the 4K Max
  (react-native-tvos + Skia v2). The game core, phone, relay, art and audio don't change;
  only the renderer does. We do this only if the 4K Max is on hand, which is why it is
  worth ordering now.

Each result goes in STATUS.md, with the traces in `docs/review/device/`.
Snags go in FRICTION.md the moment they happen.
