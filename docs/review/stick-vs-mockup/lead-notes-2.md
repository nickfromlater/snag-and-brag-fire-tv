# Lead notes, round 2: scope change (Oct 20, Nick)

Nick: "I don't want codex on design." From now on, **the lead designs every visual personally** on
`w/clarity`. You own only **stability, frame rate, device runs, captures and packaging**.

- Make no design decisions: no layout, type, color, copy or new visual effects.
- For the finale photo (lead-notes-1): diagnose which primitive draws the white rings and which drives the
  confetti, then **disable both on native** as a minimal, clearly-flagged change so the scene stops looking
  broken. Report root causes and per-scene fps in `docs/review/stick-vs-mockup/index.md`. The lead
  designs the replacement celebration.
- Ignore tv-direction.md sections 1 and 4 as implementation tasks. The lead does them.
- Keep merging `w/clarity` (the lead's design branch now) and capture every scene on the stick at
  0.5 s / 2 s / settled with fps. Those captures are how the lead judges design, so they're your most
  valuable output. Put them in `docs/review/stick-vs-mockup/` named `<scene>-<t>.png` with
  `index.md`, commit, and write `READY FOR LEAD REVIEW: docs/review/stick-vs-mockup` in STATUS.md
  after each full capture set.
- Keep the stability goals (rematch ANR, Home/return with photos, screen awake) and packaging as before.
