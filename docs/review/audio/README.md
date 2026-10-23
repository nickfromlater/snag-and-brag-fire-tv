# Audio review evidence

Generated with `pnpm --filter render-audio build`. [checks.json](checks.json) records coverage, safety, hashes, codec sample counts, the uniform gain/peak target and seam checks.

Every file uses +10.93534137 dB makeup, with a measured bank peak of -2.99998782 dBFS (target -3.0). [runtime-overlap.json](runtime-overlap.json) measures the requested win/fanfare/ko/crowd sum with all files at unity (1.0), before the TV soft limiter: -1.28862966 dBFS. No additional asset compression, limiting or per-file normalization occurs.

[effect-waveforms.png](effect-waveforms.png) shows all 112 boosted effect files, with each thumbnail scaled to its labeled exported peak for visibility. The six `music-*-3x.png` spectrograms repeat each committed boosted PCM16 loop three times; pink ticks mark wraps without obscuring the spectrum. There are no crossfades or added fades. Each channel's wrap jump must be no larger than the largest normal adjacent-sample jump within 50 ms on either side. Manifest statistics and seam checks analyze the committed 16-bit samples, not the float source.

Verify byte-for-byte regeneration with `pnpm --filter render-audio verify`. Run `pnpm test` and `pnpm typecheck` at the root. Tests validate every committed WAV/hash, every Ogg/hash, the shared gain, single-file peak, overlap and all loop lengths/boundaries/seams; no sound is played. Browser constructors reject realtime contexts, its wall-clock scheduler rejects intervals, Chrome starts with `--mute-audio`, and every browser request is restricted to localhost/data URLs.
