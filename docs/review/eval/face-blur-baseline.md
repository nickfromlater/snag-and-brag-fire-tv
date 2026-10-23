# Face-blur real-photo check

Measured 2026-10-13T15:28:05.036Z; exact phone pipeline from main snapshot `b2ce6b811316bae8f322c5a3865172497b644693` (SHA-256 `d8c6c132ce9bfeb82ce53f1c1d588454dbdfd8f622e0beef75c7f8f0c98030de`), MediaPipe 0.10.14, Chrome/155.0.8059.40.

**12/12 face images detected (100.0%); 12/12 expected faces matched.** Missed fixtures: none.

Coverage follow-up: face-melvin has less than 90% expanded-box coverage of the manually annotated face, despite a matched detection; review the forehead margin. Detection rate alone does not establish complete face redaction.

Cold detector/model initialization: **220.6 ms**. First inference: **48.2 ms**. Face redaction p50/p95/max: **7.6/48.2/48.2 ms**, including retry/pixelation and excluding JPEG decode (listed separately). Desktop CPU/headless Chrome timings are not phone performance measurements.

The real `FaceRedactor.redact` ran on each 720×720 fixture canvas, using its actual loader, CPU BlazeFace detector, padded retry and pixelation. Detector calls were observed in memory to collect boxes; production source was not edited. Matching uses one manually annotated face box per fixture with IoU ≥0.2 (coarse box matching, not identification). “Coverage” is maximum expanded-redaction-box coverage of the manually annotated face box; approximate annotations do not prove de-identification. Original and redacted working pixels are cleared; no redaction images or player photos are saved.

Offline object controls: **11/64** triggered a face box (red-pepper, red-multicolor-peppers, near-lime-cap, loot-pearl-necklace, old-wall-clock, tough-iron-pan, island-teddy, weird-satyr-mug, messy-dishes, extra-white-teddy, extra-blue-robot). Drawn/sculpted/toy faces can trigger the detector; these counts flag its effect on game objects. The isolated Pixel Judge benchmark uses the original fixtures; the [phone redaction impact report](pixel-redaction-impact.md) and its contact sheet measure the same objects after this exact redactor.

Foreign network requests: 0; browser errors: 0; native ShapeDetector available: false. JS/model/WASM were served from an ephemeral loopback server, with foreign requests blocked.

| Fixture | Expected / detected / matched | Method | Attempts | Redaction ms | Decode ms | Face box coverage | Changed pixels |
|---|---|---|---:|---:|---:|---|---:|
| face-kerwin | 1/1/1 | mediapipe | 1 | 48.20 | 43.80 | 100.0% | 34825 |
| face-cassidy | 1/1/1 | mediapipe | 1 | 7.60 | 4.00 | 97.5% | 30227 |
| face-watkins | 1/1/1 | mediapipe | 1 | 5.90 | 3.50 | 100.0% | 251440 |
| face-resnik | 1/1/1 | mediapipe | 1 | 5.60 | 3.80 | 100.0% | 119011 |
| face-jemison | 1/1/1 | mediapipe | 1 | 5.80 | 3.50 | 98.6% | 56905 |
| face-melvin | 1/1/1 | mediapipe | 1 | 16.80 | 4.80 | 87.7% | 22137 |
| face-barron | 1/1/1 | mediapipe | 1 | 9.90 | 4.00 | 100.0% | 120853 |
| face-hague | 1/1/1 | mediapipe | 1 | 9.50 | 4.60 | 93.2% | 112530 |
| face-ride | 1/1/1 | mediapipe | 1 | 8.20 | 4.90 | 100.0% | 57590 |
| face-priven | 1/1/1 | mediapipe | 1 | 5.30 | 4.10 | 100.0% | 288984 |
| face-bolt | 1/1/1 | mediapipe | 1 | 11.80 | 4.50 | 96.4% | 77366 |
| face-cockrell | 1/1/1 | mediapipe | 1 | 6.80 | 4.10 | 100.0% | 42748 |

[Per-image timings, detector boxes and object controls](face-blur.json). Input fixtures and expected boxes: [manifest](../../../tools/eval/photos/manifest.json).

Run `pnpm --filter eval faces` (defaults to main), or `pnpm --filter eval faces -- --ref <commit>`. The command snapshots Git content in memory and requires the same MediaPipe package version as the phone snapshot. No main/phone files are changed. It writes an unmeasured stub only when the selected snapshot has no face-blur module.
