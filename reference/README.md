# Snag & Brag reference bundle

Companion to the build brief ("Snag & Brag: Build Brief"). The mockup decides the look; the brief decides behavior.

## Contents

- `mockup/snag-and-brag.html` - the approved playable mockup (version 2) in one file. Open it in desktop Chrome, press Join the show, then hold the yellow button. The Skip button fast-forwards timers.
- `src/art.js` - SVG source for the 26 household-object stickers (`ART`, `OBJ` with names, brags, colors, traits and googly-eye positions), the cartoon house (`houseBack`, `houseFront`) and Sir Socksworth (`SOX`).
- `src/game.js` - mockup engine. Port the numbers: timers (`HUNT_S`, `GLOW_S`), scoring, prompt pools (`COLORS`, `BRAGP`, `SHOWP`), Pixel Judge color math (`rgb2lab`, `dE`, `colorMatch`, the `realfile` handler), spring presets (`SP`), effects (`SFX`), music moods (`MUS`), bot logic, host lines, the Bedrock prompt to reuse (`AI.read`).
- `src/style.css` - design tokens and every scene's layout on the 1280x720 TV canvas, plus all phone screens.
- `src/body.html` - TV and phone markup and copy.
- `fonts/` - Lilita One and Rubik (SIL Open Font License 1.1, licenses included).
- `screens/` - TV scenes (`tv-*.png`) and phone screens (`phone-*.png`) captured from the mockup. Use them as the visual acceptance reference.

## Scene order

lobby -> per round: title -> prompt reel -> 3-2-1 -> hunt (live feeds) -> glow-up -> reveal (Pixel Judge / Brag-Off / Showstopper) -> standings -> finale.
