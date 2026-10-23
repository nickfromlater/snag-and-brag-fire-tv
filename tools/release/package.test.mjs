// Exercise publication/build boundaries with local fake CLIs; no SDK or gh calls.
import { afterAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const fixtures = [];
const original = '/** Test-only configuration. */\nexport const config = { debug: true, offline: true } as const;\n';
afterAll(() => fixtures.forEach(directory => rmSync(directory, { recursive: true, force: true })));
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'snag release-package-')); fixtures.push(root);
  for (const directory of ['bin', 'tv/src', 'tv/tooling', 'tools/release', 'output with spaces']) mkdirSync(join(root, directory), { recursive: true });
  cpSync(new URL('./package.sh', import.meta.url), join(root, 'tools/release/package.sh'));
  cpSync(new URL('../../tv/tooling/configure.mjs', import.meta.url), join(root, 'tv/tooling/configure.mjs'));
  writeFileSync(join(root, 'tv/src/config.ts'), original);
  writeFileSync(join(root, 'tv/package.json'), JSON.stringify({ version: '0.1.0' }));
  const git = args => { const result = spawnSync('git', args, { cwd: root }); expect(result.status).toBe(0); };
  git(['init', '-q', '-b', 'release-fixture']);
  git(['add', 'tv/src/config.ts', 'tv/package.json']);
  git(['-c', 'user.name=Release Fixture', '-c', 'user.email=release@example.invalid', 'commit', '-qm', 'fixture']);
  writeFileSync(join(root, 'bin/vega'), '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });
  writeFileSync(join(root, 'bin/gh'), '#!/usr/bin/env node\nrequire("node:fs").writeFileSync(process.env.FAKE_GH_MARKER, JSON.stringify(process.argv.slice(2)));\n', { mode: 0o755 });
  writeFileSync(join(root, 'bin/pnpm'), `#!/usr/bin/env node
const fs = require('node:fs'), path = require('node:path');
const args = process.argv.slice(2), root = process.cwd();
if (args.includes('assets')) process.exit(Number(process.env.FAKE_ASSET_EXIT || 0));
const arch = args[args.indexOf('--target') + 1];
fs.appendFileSync(path.join(root, 'build-configs.jsonl'), JSON.stringify({ arch, args, config: fs.readFileSync('tv/src/config.ts', 'utf8') }) + '\\n');
if (arch === process.env.FAKE_FAIL_ARCH) process.exit(2);
if (arch === process.env.FAKE_SKIP_ARCH) process.exit(0);
const directory = path.join(root, 'tv/build/private/kepler/tv/undefined/vega', arch, 'Release');
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(directory, 'tv_' + arch + '.vpkg'), 'synthetic package: ' + arch);
if (arch === process.env.FAKE_DUPLICATE_ARCH) {
  const duplicate = path.join(root, 'tv/build/duplicate', arch, 'Release');
  fs.mkdirSync(duplicate, { recursive: true }); fs.writeFileSync(path.join(duplicate, 'tv_' + arch + '.vpkg'), 'duplicate');
}
`, { mode: 0o755 });
  return { root, output: join(root, 'output with spaces'), marker: join(root, 'gh-called.json') };
}
function run(f, extra = {}, unset = false) {
  const env = { ...process.env, PATH: join(f.root, 'bin') + ':' + process.env.PATH,
    TV_RELAY_URL: 'wss://relay.example.invalid/ws', RELEASE_OUTPUT_DIR: f.output,
    RELEASE_TAG: 'release-candidate/v0.1.0', FAKE_GH_MARKER: f.marker,
    TV_DEBUG: 'true', TV_OFFLINE: 'true', SNAG_SHOWCASE: '1', TV_PHOTO_PROBE: 'true', ...extra };
  if (unset) delete env.TV_RELAY_URL;
  return spawnSync('bash', [join(f.root, 'tools/release/package.sh')], { cwd: tmpdir(), env, encoding: 'utf8', timeout: 20_000 });
}
function restored(f) {
  expect(readFileSync(join(f.root, 'tv/src/config.ts'), 'utf8')).toBe(original);
  expect(existsSync(join(f.root, '.release-package.lock'))).toBe(false);
  expect(readdirSync(f.output).some(name => name.startsWith('.package.'))).toBe(false);
  expect(existsSync(f.marker)).toBe(false);
}

describe('release package boundaries', () => {
  it('supports help without an endpoint or any mutation', () => {
    const f = fixture();
    const env = { ...process.env }; delete env.TV_RELAY_URL;
    const result = spawnSync('bash', [join(f.root, 'tools/release/package.sh'), '--help'], { env, encoding: 'utf8' });
    expect(result.status).toBe(0); expect(result.stdout).toContain('Usage:'); restored(f);
  });
  it('fails before mutation when TV_RELAY_URL is unset', () => {
    const f = fixture(), result = run(f, {}, true);
    expect(result.status).not.toBe(0); expect(result.stderr).toContain('Set TV_RELAY_URL'); restored(f);
    expect(readdirSync(f.output)).toEqual([]);
  });
  it.each(['https://relay.example.invalid/ws', 'wss://relay.example.invalid/other', 'wss://relay.example.invalid/ws?token=fixture', 'wss://relay.example.invalid/ws#fixture', 'not a url'])('rejects unsafe or malformed URL %s', url => {
    const f = fixture(), result = run(f, { TV_RELAY_URL: url });
    expect(result.status).not.toBe(0); expect(result.stderr).toContain('TV_RELAY_URL must be'); restored(f);
    expect(readdirSync(f.output)).toEqual([]);
  });
  it('rejects URL credentials without logging their value', () => {
    const f = fixture(), credential = 'synthetic-' + 'fixture';
    const url = ['wss://fixture:', credential, '@', 'relay.example.invalid/ws'].join('');
    const result = run(f, { TV_RELAY_URL: url });
    expect(result.status).not.toBe(0); expect(result.stderr).toContain('TV_RELAY_URL must be');
    expect(result.stdout + result.stderr).not.toContain(credential); restored(f);
  });
  it('builds each target with release flags, hashes named packages, quotes paths and never invokes gh', () => {
    const f = fixture(), result = run(f);
    expect(result.status, result.stderr).toBe(0); restored(f);
    const records = readFileSync(join(f.root, 'build-configs.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    expect(records.map(r => r.arch)).toEqual(['armv7', 'aarch64', 'x86_64']);
    for (const record of records) {
      expect(record.args).toContain('Release'); expect(record.args).toContain('--use-system-js-bundles');
      expect(record.args).toContain('--hermes-flags=-O,-w,-g0');
      const config = JSON.parse(record.config.match(/export const config = (.*) as const;/)[1]);
      expect(config).toMatchObject({ relayUrl: 'wss://relay.example.invalid/ws', debug: false, offline: false, showcase: false, photoProbe: false });
    }
    const manifest = JSON.parse(readFileSync(join(f.output, 'release-manifest.json'), 'utf8'));
    for (const artifact of manifest.artifacts) {
      const bytes = readFileSync(join(f.output, artifact.file));
      expect(artifact.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
      expect(readFileSync(join(f.output, 'SHA256SUMS'), 'utf8')).toContain(`${artifact.sha256}  ${artifact.file}`);
    }
    const command = result.stdout.split('\n').find(line => line.startsWith('gh release create '));
    expect(command).toContain('--draft'); expect(command).toContain('--target');
    // Parse the printed shell quoting through an explicitly fake gh executable.
    const parsed = spawnSync('bash', ['-c', command], { cwd: f.root, env: { ...process.env, PATH: join(f.root, 'bin') + ':' + process.env.PATH, FAKE_GH_MARKER: f.marker } });
    expect(parsed.status).toBe(0);
    const args = JSON.parse(readFileSync(f.marker, 'utf8'));
    expect(args.slice(0, 3)).toEqual(['release', 'create', 'release-candidate/v0.1.0']);
    expect(args[3]).toBe('output with spaces/snagbrag_armv7.vpkg');
  });
  it('restores config and retains the previous upload set after a target failure', () => {
    const f = fixture(); writeFileSync(join(f.output, 'SHA256SUMS'), 'previous sums');
    const result = run(f, { FAKE_FAIL_ARCH: 'aarch64' });
    expect(result.status).not.toBe(0); expect(result.stderr).toContain('aarch64 build failed'); restored(f);
    expect(readFileSync(join(f.output, 'SHA256SUMS'), 'utf8')).toBe('previous sums');
    expect(readdirSync(f.output)).toEqual(['SHA256SUMS']);
  });
  it('restores configuration after failed asset generation', () => {
    const f = fixture(), result = run(f, { FAKE_ASSET_EXIT: '2' });
    expect(result.status).not.toBe(0); expect(result.stderr).toContain('asset generation failed'); restored(f);
  });
  it('rejects ambiguous archives', () => {
    const f = fixture(), result = run(f, { FAKE_DUPLICATE_ARCH: 'armv7' });
    expect(result.status).not.toBe(0); expect(result.stderr).toContain('exactly one fresh'); restored(f);
  });
  it('cannot reuse a stale archive when the builder produces nothing', () => {
    const f = fixture(), directory = join(f.root, 'tv/build/private/kepler/tv/undefined/vega/armv7/Release');
    mkdirSync(directory, { recursive: true }); writeFileSync(join(directory, 'tv_armv7.vpkg'), 'stale');
    const result = run(f, { FAKE_SKIP_ARCH: 'armv7' });
    expect(result.status).not.toBe(0); expect(result.stderr).toContain('exactly one fresh'); restored(f);
  });
  it('does not remove another packager’s lock or rewrite configuration', () => {
    const f = fixture(), lock = join(f.root, '.release-package.lock'); mkdirSync(lock); writeFileSync(join(lock, 'pid'), 'fixture owner');
    const result = run(f);
    expect(result.status).not.toBe(0); expect(result.stderr).toContain('Another packager');
    expect(readFileSync(join(lock, 'pid'), 'utf8')).toBe('fixture owner');
    expect(readFileSync(join(f.root, 'tv/src/config.ts'), 'utf8')).toBe(original);
    expect(existsSync(f.marker)).toBe(false); expect(readdirSync(f.output)).toEqual([]);
  });
});
