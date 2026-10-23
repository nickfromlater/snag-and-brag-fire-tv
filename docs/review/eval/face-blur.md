# Face-blur real-photo check

Measured 2026-10-13T16:28:16.751Z; exact phone pipeline from working tree on 7ffe2d3b78d44c52e3fe0162d848edd2bcadc4bf; parent revision `7ffe2d3b78d44c52e3fe0162d848edd2bcadc4bf` (SHA-256 `83a044f2a7b51ee441bf074b4fec9bca92212f2cae4ac25181ca57464846da3d`), MediaPipe 0.10.14, Chrome/155.0.8059.40.

**12/12 face images detected (100.0%); 12/12 expected faces matched.** Missed fixtures: none.

Settings: {"confidence":0.7,"retry":false,"retryConfidence":0.7,"minRelativeSize":0.05,"minAspectRatio":0.5,"maxAspectRatio":2,"minArea":0.005}; padding: {"sides":0.25,"top":0.45,"bottom":0.25}.

Coverage follow-up: all matched faces have at least 90% expanded-box coverage of the coarse annotations. Detection rate alone does not establish complete face redaction.

Cold detector/model initialization: **74.9 ms**. First inference: **31.6 ms**. Face redaction p50/p95/max: **6.2/31.6/31.6 ms**, including retry/pixelation and excluding JPEG decode (listed separately). Desktop CPU/headless Chrome timings are not phone performance measurements.

The real `FaceRedactor.redact` ran on each 720×720 fixture canvas, using its actual loader, CPU BlazeFace detector, padded retry and pixelation. Detector calls were observed in memory to collect boxes; the selected phone source ran unchanged. Matching uses one manually annotated face box per fixture with IoU ≥0.2 (coarse box matching, not identification). “Coverage” is maximum expanded-redaction-box coverage of the manually annotated face box; approximate annotations do not prove de-identification. Original and redacted working pixels are cleared; no redaction images or player photos are saved.

Offline object controls: **0/64** triggered a face box (none). Drawn/sculpted/toy faces can trigger the detector; these counts flag its effect on game objects. The isolated Pixel Judge benchmark uses the original fixtures; the [phone redaction impact report](pixel-redaction-impact.md) and its contact sheet measure the same objects after this exact redactor.

Foreign network requests: 0; browser errors: 0; native ShapeDetector available: false. JS/model/WASM were served from an ephemeral loopback server, with foreign requests blocked.

| Fixture | Expected / detected / matched | Method | Attempts | Redaction ms | Decode ms | Face box coverage | Changed pixels |
|---|---|---|---:|---:|---:|---|---:|
| face-kerwin | 1/1/1 | mediapipe | 1 | 31.60 | 36.90 | 100.0% | 34189 |
| face-cassidy | 1/1/1 | mediapipe | 1 | 6.80 | 3.80 | 100.0% | 34308 |
| face-watkins | 1/1/1 | mediapipe | 1 | 7.00 | 3.40 | 100.0% | 250466 |
| face-resnik | 1/1/1 | mediapipe | 1 | 6.20 | 3.50 | 100.0% | 134738 |
| face-jemison | 1/1/1 | mediapipe | 1 | 7.50 | 3.20 | 100.0% | 64573 |
| face-melvin | 1/1/1 | mediapipe | 1 | 6.10 | 3.50 | 100.0% | 25059 |
| face-barron | 1/1/1 | mediapipe | 1 | 6.10 | 3.00 | 100.0% | 139138 |
| face-hague | 1/1/1 | mediapipe | 1 | 6.40 | 3.20 | 100.0% | 129444 |
| face-ride | 1/1/1 | mediapipe | 1 | 4.90 | 4.10 | 100.0% | 65267 |
| face-priven | 1/1/1 | mediapipe | 1 | 5.50 | 3.90 | 100.0% | 325744 |
| face-bolt | 1/1/1 | mediapipe | 1 | 6.50 | 3.20 | 100.0% | 79011 |
| face-cockrell | 1/1/1 | mediapipe | 1 | 4.90 | 3.90 | 100.0% | 48311 |

[Per-image timings, detector boxes and object controls](face-blur.json). Input fixtures and expected boxes: [manifest](../../../tools/eval/photos/manifest.json).

Run `pnpm --filter eval faces` (defaults to the current working tree), or `pnpm --filter eval faces -- --ref <commit>`. The command compiles the selected phone source and assets in memory and requires the same MediaPipe package version as the phone snapshot. No phone files are changed by this command. It writes an unmeasured stub only when the selected snapshot has no face-blur module.
