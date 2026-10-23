# Native scene review provenance · 2026-10-13

The intro, hunt, judge, brag, show, stand and champ comparison sheets use actual
VVD screenshots retained by the integration worker on starting commit `227edd1`.
Each pane names its state and the unmodified reference screen beside it. Capture
metadata is in `native-scene-capture-progress.json`; the champion pane uses the
verified `native-finale.png` and `native-verification.json`. These are prior native
captures, not a claim that this finish candidate completed a fresh full game.

The three starting native clips were 26.29, 23.73 and 23.90 MB. Re-encode with
`ffmpeg -c:v libx264 -crf 28 -preset slow -an -threads 2`, increasing CRF only when
needed for the 10 MB ceiling. Round 1 required CRF 31; rounds 2 and 3 fit at CRF 28.
Every clip retains 1920×1080, 60 fps, its original frame count and duration, and
contains no audio track. The receipt records source hashes, output hashes and sizes.

PNG compression is lossless. Regenerate sheets with:

    export PATH=$HOME/.nvm/versions/node/v24.20.0/bin:$PATH
    node tv/tooling/compare-scenes.mjs

The reference game has four teams and different prompt/object/score values; the
native captures use three bots. The canonical round-title reference is reused for
all three title variants. Several frames capture an entrance, flip, host typing or
transition into gold, so their motion phase differs from the static reference.
These differences are visible review evidence, not substituted or painted pixels.

The native photo correction does not affect these all-bot object screenshots. The
latest human-phone candidate's mask appears in `g2-native-mask.png` and the
20-second `../tv-g2-color-rush-reveal.mp4`; that candidate still stalls in the judge.
`g2-native-e2e.json` explicitly records `pass: false`. Full native G2 acceptance
remains outstanding, including the phone's three-redaction/finale assertions.
