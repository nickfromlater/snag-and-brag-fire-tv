# Native photo bisect — 2026-10-13

Normal speed, VVD OS 1.2, aarch64 Release / Hermes, synthetic 720×720 JPEG generated in memory. Mac output stayed muted. No player photo was used or persisted.

The isolated photo-only startup build passed photo → rounded native clipping → googly eyes → a full 576-cell mask → four judge cards with four full masks. Each case has early/late native screenshots, advancing visible counters, three counter publications, responsive snapshots and zero exceptions. See receipt.json. The bisect took under 45 minutes including setup, builds and the rerun.

The original complete-show receipt still fails at the first judge after 78 seconds. These isolated passes do not establish that rounded clipping or the mask alone caused that failure. Earlier setup attempts stalled while swapping/detaching the animated lobby, before the requested fixture mounted. Those attempts are excluded from the isolated component pass. Cold-starting the photo fixture and omitting unrelated stage layers makes the component comparison meaningful. The final fix must therefore still be verified in the full native phone game.

The requested robust replacement remains justified by the platform's established presentation limit: merge the mask to one Path and one animated Rect clip, compose the photo through calibrated art coverage in memory, and retain it across scenes.

To reproduce: acquire ~/.snag-vvd.lock with an owner beginning 'TV photo worker'; run a mock relay on 8789 and the local TV control on 8790; reverse VVD 8787 to host 8789 and 8790 to host 8790. Set TV_PHOTO_PROBE=true when running tv/tooling/configure.mjs, build/install aarch64 Release with system bundles, then run node tv/tooling/bisect-photo-native.mjs. Restore TV_PHOTO_PROBE=false for the actual game. The photo-only build is a diagnostic variant, not a delivered app setting.
