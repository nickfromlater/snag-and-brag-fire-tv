import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const rootDir = resolve(packageDir, '../..');
export const photoDir = resolve(packageDir, 'photos');
export const reviewDir = resolve(rootDir, 'docs/review/eval');
