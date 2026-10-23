# Self-hosted face detector

These are static inference assets, never player images. The phone fetches them only
from its own origin after joining. Both runtime variants are shipped; a browser
downloads only the SIMD or non-SIMD variant selected by `FilesetResolver`.

- WASM and loaders: `@mediapipe/tasks-vision` **0.10.14**, Apache-2.0, copied
  unchanged from the pinned dependency's `wasm/` directory. `LICENSE` accompanies
  the vendored runtime. The current 1.1.0 runtime was significantly larger.
- Model: Google's BlazeFace short-range float16 model, version **1**, downloaded
  from <https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite>.
- Official model documentation: <https://developers.google.com/edge/mediapipe/solutions/vision/face_detector>.

To refresh the runtime, pin the new package version in `phone/package.json`, copy
its matching WASM/loaders here, then run the unit tests, browser face-blur test,
build-size measurement and full relay/TV game. Keep the model version pinned.

No stock photos, test face photographs or face illustrations are bundled. Browser
tests draw their own synthetic shapes in memory and save only numeric receipts.
