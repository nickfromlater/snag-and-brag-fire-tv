/** Attaching a native voice clip is a synchronous MediaSource setup (130-700 ms on the stick).
 * It waits this long after a scene/phase entrance so it never lands on an entering scene. */
export const SPEECH_PREPARE_SETTLE_MS = 900;
export const speechPrepareDelay = (enteredAt: number, now: number): number => Math.max(0, enteredAt + SPEECH_PREPARE_SETTLE_MS - now);
