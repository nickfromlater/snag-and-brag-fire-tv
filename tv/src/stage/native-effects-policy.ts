import type { Scene } from '@snag/shared';

// Native particles are off in every scene. Up to 120 particles redrawn through React at 30 Hz froze on
// the stick, leaving slam rings and confetti stuck on screen (Nick's TV: finale photo and countdown video,
// Oct 20). Payoffs use CelebrationBurst (pre-rendered layers on native-driver transforms) instead.
// The web renderer keeps its particles.
export const DISABLE_NATIVE_PARTICLES = true;
export const suppressNativeFinaleParticles = (_scene: Scene): boolean => DISABLE_NATIVE_PARTICLES;

// The stage-video backdrop keeps one decoder for the whole game. A mood change used to set a new
// video src: a synchronous native load on the JS thread (6 per game, 120-730 ms each on the stick).
// Moods other than the game's first, and the judge/finale palettes, now show the static mood
// raster over the running video. Look change for the lead: those moods are still, not moving.
export const NATIVE_BACKDROP_SINGLE_DECODER = true;

// Blurred shadows (the Pixel Judge scan beam's 22 px lime glow, one per card) are redrawn every
// frame while the beam sweeps. Judge rendered about one frame a second on the stick (Oct 20
// baseline, static background, no video). Native drops the blur; the beam bar itself stays.
// Look change for the lead: a pre-rendered glow raster can replace it.
export const DISABLE_NATIVE_BLUR_SHADOWS = true;

// Still mood backdrops on native. Measured on the stick (Oct 21, full hosted games): with the
// stage-video backdrop the UI surface presented 25-46 fps by scene (the decoder's own surface
// composited under a full-screen UI); with still mood rasters every scene held 47 fps, p95 34 ms.
// The animated vector backdrop cost the lobby about 9 fps. Motion lives in the scenes instead.
export const NATIVE_STILL_BACKDROP = true;

// Idle loops off on native (Nick, Oct 21: "Need 60 ... even if it means cutting anims").
// Every continuously looping layer (ticker scroll, host idle sway, parade walk, googly-eye idle
// wobble, camera jitter, decorative loops, infinite Motion loops) forces a full-surface redraw
// each frame; together they held the stick at 47 fps. One-shot beats (entrances, slams, flips,
// reveals, the tug-of-war, the podium) still animate.
export const NATIVE_IDLE_LOOPS_OFF = true;
