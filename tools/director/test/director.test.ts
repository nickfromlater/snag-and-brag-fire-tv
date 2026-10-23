import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { beatNames, coverageCuts, sceneRanges, segmentName, segmentsFor } from '../lib.mjs';
import { cueSummary, makePlan } from '../plan.mjs';
import { replaceOnce, showcaseHtml } from '../web.mjs';
import { acquireVvdLock, bridgeRequest, vvdSegments } from '../vvd.mjs';
import { startBridge } from '../bridge.mjs';

describe('director timeline and edit plan', () => {
  it('covers a complete long game once after trimming real overlap', () => {
    const segments = segmentsFor(401_234, 170_000, 2000);
    expect(segments).toEqual([{ startMs: 0, endMs: 170000 }, { startMs: 168000, endMs: 338000 }, { startMs: 336000, endMs: 401234 }]);
    const cuts = coverageCuts(segments, 401234);
    expect(cuts.reduce((n: number, s: { cutEndMs: number; startMs: number }) => n + s.cutEndMs - s.startMs, 0)).toBe(401234);
    expect(segments.every(s => s.endMs - s.startMs <= 170000)).toBe(true);
    expect(() => segmentsFor(200000, 180000, 2000)).toThrow(/170/);
    expect(() => coverageCuts([{ startMs: 0, endMs: 5 }, { startMs: 10, endMs: 20 }], 20)).toThrow(/Gap/);
    expect(() => coverageCuts([{ startMs: 0, endMs: 5 }], 20)).toThrow(/end/);
    expect(vvdSegments(223360)).toEqual([{ startMs: 0, endMs: 169000 }, { startMs: 167000, endMs: 223360 }]);
    expect(() => vvdSegments(223360, 180)).toThrow(/170/);
  });
  it('produces repeatable safe cue logs and names every scene and gallery beat', () => {
    const a = makePlan(), b = makePlan(); expect(a).toEqual(b);
    expect(Object.keys(a.beats)).toEqual(beatNames);
    expect(a.scenes).toHaveLength(16); expect(a.scenes.filter((s: { name: string }) => s.name.startsWith('brag-')).map((s: { name: string }) => s.name)).toEqual(['brag-off-intro', 'brag-off-hunt', 'brag-semifinal-1', 'brag-semifinal-2', 'brag-final']);
    expect(segmentName({ startMs: 0, endMs: 170000 }, a.scenes, 0)).toBe('01-lobby-to-showstopper-hunt.mp4');
    expect(cueSummary({ seq: 1, at: 0, round: 0, cue: { k: 'feed', jpeg: 'private-photo-bytes', photoId: 'private-id' } })).toBeUndefined();
    expect(JSON.stringify(a)).not.toMatch(/"(photoId|jpeg|base64|mask|tvKey|roomKey)":/);
    expect(a.beats['brag-final-mash']!).toBeGreaterThan(a.beats['pixel-judge-mask']!);
  });
  it('keeps literal dollar helpers intact and refuses ambiguous reference hooks', async () => {
    expect(replaceOnce('marker', 'marker', '$$ $&')).toBe('$$ $&');
    expect(() => replaceOnce('marker marker', 'marker', 'replacement')).toThrow(/unique/);
    const html = await showcaseHtml(); expect(html).toContain('var $$=function(s,r)');
    expect(html).toContain('Two to four teams.'); expect(html).toContain('window.AudioContext=undefined');
    expect(html).toContain('viewBox="0 0 120 120"');
  });
});

describe('exclusive VVD ownership and replay bridge', () => {
  it('never steals an existing lock and releases only its own', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'snag-director-lock-')), lock = join(directory, 'lock');
    try {
      const release = await acquireVvdLock(lock);
      await writeFile(join(lock, 'other-worker-sentinel'), 'unchanged');
      await expect(acquireVvdLock(lock)).rejects.toThrow(/locked/);
      expect(await readFile(join(lock, 'other-worker-sentinel'), 'utf8')).toBe('unchanged');
      await release(); await expect(stat(lock)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it('seeks the actual core to the final mash and the two-vote win, then holds without a menu', async () => {
    const bridge = await startBridge({ port: 0 }), url = `http://127.0.0.1:${bridge.port}`;
    let renderer: WebSocket | undefined;
    try {
      expect(await bridgeRequest(url, '/status')).toMatchObject({ held: true, rendererReady: false, syntheticOnly: true });
      renderer = new WebSocket(`ws://127.0.0.1:${bridge.port}/renderer`);
      await new Promise<void>((resolve, reject) => { renderer!.once('open', resolve); renderer!.once('error', reject); });
      const frames: any[] = [];
      renderer.on('message', b => frames.push(JSON.parse(b.toString())));
      renderer.send(JSON.stringify({ t: 'director-renderer', target: 'vvd', width: 1920, height: 1080 }));
      for (let i = 0; i < 30 && !(await bridgeRequest(url, '/status') as { rendererReady: boolean }).rendererReady; i++) await new Promise(r => setTimeout(r,10));
      const plan = await bridgeRequest(url, '/plan') as { beats: Record<string, number> };
      await bridgeRequest(url, '/seek', { atMs: plan.beats['brag-final-mash'] });
      await new Promise(r => setTimeout(r,20));
      expect(frames.at(-1).view.content.match).toMatchObject({ final: true });
      expect(frames.at(-1).view.phase).toBe('mash'); expect(frames.at(-1).view.menu).toBeNull();
      await bridgeRequest(url, '/seek', { atMs: plan.beats['showstopper-win'] });
      await new Promise(r => setTimeout(r,20));
      expect(frames.at(-1).view.content).toMatchObject({ winner: 'p1', holographic: true });
      expect(frames.at(-1).view.content.pedestals.find((p: any) => p.find.team === 'p1').voters).toHaveLength(2);
      expect(frames.at(-1).cues).toEqual([]);
      await bridgeRequest(url, '/play', {}); await new Promise(r => setTimeout(r,70));
      const held = await bridgeRequest(url, '/hold', {}) as { atMs: number }; await new Promise(r => setTimeout(r,70));
      expect((await bridgeRequest(url, '/status') as { atMs: number }).atMs).toBe(held.atMs);
      await expect(bridgeRequest(url, '/seek', { atMs: -1 })).rejects.toThrow(/seek/);
    } finally { renderer?.terminate(); await bridge.close(); }
  });
});
