import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { it, expect } from 'vitest';

it('rejects invalid or truncated native captures and preserves existing recording ownership', () => {
  const output = execFileSync('python3', ['-m', 'unittest', 'test_capture.py'], {
    cwd: fileURLToPath(new URL('../../../spike/tooling/', import.meta.url)), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  expect(output).toBe('');
});
