import { PCM_SAMPLE_RATE } from './wav.js';

// Exactly one second of synthetic silence; each response gets its own WAV copy.
export const SILENT_PCM = Buffer.alloc(PCM_SAMPLE_RATE * 2);
