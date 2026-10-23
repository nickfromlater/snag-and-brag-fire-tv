import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

it('rejects an untrusted static archive before extraction or replacing an installed encoder', async () => {
  const root = await mkdtemp(join(tmpdir(), 'snag-encoder-test-'));
  try {
    const commands = join(root, 'commands'), target = join(root, 'installed'), links = join(root, 'links');
    await Promise.all([commands, target, links].map(p => mkdir(p)));
    await writeFile(join(target, 'ffmpeg'), 'existing verified encoder');
    // No network: simulate a corrupted download. sha256sum remains the real tool.
    await writeFile(join(commands, 'curl'), '#!/bin/sh\nwhile [ "$#" -gt 0 ]; do if [ "$1" = -o ]; then shift; printf corrupted > "$1"; exit 0; fi; shift; done\nexit 1\n', { mode: 0o755 });
    await writeFile(join(commands, 'tar'), '#!/bin/sh\nprintf unexpected > "$SENTINEL"\nexit 1\n', { mode: 0o755 });
    // macOS's BSD sha256sum lacks GNU long flags; shasum implements the same real check.
    if (process.platform === 'darwin') await writeFile(join(commands, 'sha256sum'), '#!/bin/sh\nexec shasum -a 256 "$@"\n', { mode: 0o755 });
    const script = 'source deploy/setup.sh; install_ffmpeg "$1" "$2" "$3"';
    const result = spawnSync('bash', ['-c', script, 'test', root, target, links], {
      env: { ...process.env, PATH: commands + ':' + process.env.PATH, SENTINEL: join(root, 'extracted') }, encoding: 'utf8',
    });
    expect(result.status).toBe(1); expect(result.stdout).toContain('ffmpeg-7.0.2-arm64-static.tar.xz: FAILED');
    expect(await readFile(join(target, 'ffmpeg'), 'utf8')).toBe('existing verified encoder');
    await expect(readFile(join(root, 'extracted'))).rejects.toThrow();
    await expect(readFile(join(links, 'ffmpeg'))).rejects.toThrow();
  } finally { await rm(root, { recursive: true, force: true }); }
});
