# Testing Snag & Brag

Snag & Brag is a party game: the **Fire TV app** is the show, and every player's **phone**
is a camera and controller, joined by scanning a QR code. **You can play a full game alone
with one phone**: three bot teams fill the room. No login, no account,
nothing to install on the phone. The game server stays up through the end of judging
(health check: https://d2q0olvpmfmvjn.cloudfront.net/healthz).

## 1. Run the TV app

**Option A: a Fire TV running Vega OS** (tested on the Fire TV Stick 4K Select).
1. Turn on Developer Mode: Settings › My Fire TV › About, highlight the device name and
   press Select 7 times, then Developer Options › Developer Mode.
2. Install the Vega SDK (`vega` CLI) and connect the stick to your computer with a USB data
   cable. Run `vega devmode login`, then `vega devmode enable-device --code <code shown on
   the TV>`.
3. Download `snagbrag_armv7.vpkg` from the [v1.0.0 release](https://github.com/nickfromlater/snag-and-brag-fire-tv/releases/tag/v1.0.0), then install and launch it:

```sh
vega device install-app -p snagbrag_armv7.vpkg
vega device launch-app --appName com.snagbrag.tv.main
```

**Option B: the Vega Virtual Device** (no hardware; macOS or Linux with the Vega SDK).
Start it with `vega virtual-device start`, install `snagbrag_aarch64.vpkg` (Apple silicon)
or `snagbrag_x86_64.vpkg`, and launch `com.snagbrag.tv.main` as above.

**Build from source** (any option): with the Vega SDK installed, run
`TV_RELAY_URL=wss://d2q0olvpmfmvjn.cloudfront.net/ws bash tools/release/package.sh`;
packages land in `dist/release/`.

The app needs internet. Once it is running, no computer connection or local server is
needed.

## 2. Join from your phone

The TV shows a lobby with a QR code and a 4-letter room code.
- **Scan the QR code** with your phone's camera, or open
  **https://d2q0olvpmfmvjn.cloudfront.net/** and type the code.
- Use **Safari on iPhone** or **Chrome on Android**, not an in-app browser (the page tells
  you if you are in one).
- Allow the camera when asked. If you don't, you can still pick photos from your library.

## 3. Play solo against the bots

1. On your phone, switch on **Play with bots**. Three rival teams join on the TV. (You can
   also do this from the TV remote: press Select in the lobby and choose **Play with bots**.)
2. **Hold the yellow button** on your phone to go live.
3. Each round: watch the prompt reel on the TV, then hunt your home for something that
   fits ("the most RED thing", "something a PIRATE would steal") and snap it. Stick on two
   googly eyes, pick a stage name and a brag line, and send it.
4. Watch the reveal: the **Pixel Judge** (it lights up the pixels that matched the color),
   the **Brag-Off** (mash your phone to win the tug-of-war), then the **Showstopper** vote.
5. The finale crowns the champions. Tap **Run it back** to play again.

A game of three rounds takes about 5 minutes. Sir Socksworth speaks with Amazon Polly.
Stage-name and brag suggestions come from a built-in catalog while our Amazon Bedrock
model access is pending.

## Remote control

D-pad and Select move and choose. **Play/Pause** or **Back** opens the pause menu
(Resume, Skip this phase, Sound, Music, Voice, End game). **Fast-forward** skips the current
phase. Back never leaves a live game without asking.

## Privacy

Detected faces are blurred on the phone before upload. Photos live only in memory for the
life of the room; nothing is saved or logged. Ending the room clears them from the server,
and a rematch clears them from the TV.

## Troubleshooting

- **The phone can't reach the game:** check you scanned the QR code on the TV you are
  playing on (each room code is new), and that the phone has internet.
- **No camera prompt:** you're probably in an in-app browser; open the link in
  Safari/Chrome. You can always use "Choose photo".
- **Wrong or expired code:** the controller returns to code entry. Read the current
  four letters from the TV and try again.
- **The screensaver appears:** press a remote button to return to the game.
- **Server status:** https://d2q0olvpmfmvjn.cloudfront.net/healthz returns an `ok: true`
  response while healthy.

## Automated checks

`pnpm test` and `pnpm typecheck` validate the workspace. `tools/device/verify-live.mjs`
plays full hosted games on a device with synthetic photos and checks every round, the
photos, the audio and the rematch.
