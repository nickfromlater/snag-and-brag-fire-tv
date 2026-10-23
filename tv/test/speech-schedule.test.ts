import { expect, it } from 'vitest';
import { SPEECH_PREPARE_SETTLE_MS, speechPrepareDelay } from '../src/stage/speech-schedule';

it('defers native voice attach until a scene entrance has settled', () => {
  expect(speechPrepareDelay(-Infinity, 5000)).toBe(0);
  expect(speechPrepareDelay(1000, 1000)).toBe(SPEECH_PREPARE_SETTLE_MS);
  expect(speechPrepareDelay(1000, 1600)).toBe(SPEECH_PREPARE_SETTLE_MS - 600);
  expect(speechPrepareDelay(1000, 1000 + SPEECH_PREPARE_SETTLE_MS + 1)).toBe(0);
});
