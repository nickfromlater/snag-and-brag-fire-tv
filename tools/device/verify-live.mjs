// Exercise a real TV host through a synthetic phone protocol client. This does
// not certify physical phone camera/gesture behavior. Images exist only in RAM.
// Diagnostic mode observes native render metadata on port 8790. For a production
// build, DEVICE_ROOM_CODE uses the visible TV code and checks protocol/foreground;
// native pictures and finale must then be inspected separately.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const require = createRequire(new URL('../../relay/package.json', import.meta.url));
const WebSocket = require('ws'), sharp = require('sharp');
const origin = 'https://d2q0olvpmfmvjn.cloudfront.net';
const started = Date.now(), timers = new Set(), media = [];
const deviceSerial = process.env.DEVICE_SERIAL, execute = promisify(execFile);
const visibleCode = process.env.DEVICE_ROOM_CODE?.toUpperCase(), diagnostic = !visibleCode;
const checkHome = process.env.DEVICE_CHECK_HOME === '1';
const homeOnly = process.env.DEVICE_CHECK_HOME_ONLY === '1';
const checkVideo = process.env.DEVICE_CHECK_VIDEO === '1';
const capturePacing = process.env.DEVICE_CAPTURE_PACING === '1';
if (checkHome && (!diagnostic || !deviceSerial)) throw new Error('Home recovery check requires diagnostic telemetry and DEVICE_SERIAL');
if (homeOnly && !checkHome) throw new Error('Home-only check requires DEVICE_CHECK_HOME=1');
if (visibleCode && !/^[A-Z]{4}$/.test(visibleCode)) throw new Error('DEVICE_ROOM_CODE must contain four TV letters');
const gameCount = Math.max(1, Math.min(3, Number(process.env.DEVICE_CHECK_GAMES ?? 1)));
const reproductionSpeed = Math.max(1, Math.min(4, Number(process.env.DEVICE_REPRO_SPEED ?? 1)));
if (reproductionSpeed !== 1 && !diagnostic) throw new Error('Accelerated reproduction requires diagnostic telemetry');
const report = { startedAt: new Date().toISOString(), syntheticMediaOnly: true,
  scope: diagnostic ? 'Native render telemetry plus hosted relay and synthetic phone protocol; physical phone UX is separate' : 'Production phone protocol and native foreground only; native pictures/finale and physical phone UX require separate inspection',
  nativeRenderTelemetry: diagnostic,
  roundsSnagged: [], phoneScreens: [], nativeScenes: [], voicePaths: {}, audioErrors: [], exceptions: [],
  photoDecodes: 0, maskObserved: false, phoneCompleted: false, nativeCompleted: false, maxSnapshotGapMs: 0, disconnects: [], appStates: [], foregroundChecks: [], games: [] };
report.stageVideo = { playingEvents: 0, errorEvents: 0, releaseRequests: 0 };
if (capturePacing) { report.capturePacing = true; report.scope += '; capture fixture delays start, glow and vote; not uninterrupted stability/FPS acceptance'; }
if (reproductionSpeed !== 1) { report.reproductionOnly = true; report.clockSpeed = reproductionSpeed; report.scope += '; accelerated fault reproduction, not normal-speed acceptance'; }
if (checkHome) { report.scope += '; includes one intentional 12-second Home interruption after a native photo reveal'; report.homeRecovery = { attempted: false, completed: false }; }
if (homeOnly) { report.homeRecoveryOnly = true; report.scope += '; recovery check only, full game completion is outside this run'; }
let observer, phone, latest, lastSnapshot = Date.now(), connecting = false, finished = false;
let audioReady = false, layerApplied = false;
let homePending = false, homeReturnStarted = false, homeResumeSent = false, homeDeadline = 0, homeBefore;
let awaitingRematch = false, gamePhotoStart = 0, gameVoiceStart = 0, gameStartedAt = Date.now();
const diagnosticLayer = process.env.DEVICE_CHECK_LAYER ? Number(process.env.DEVICE_CHECK_LAYER) : undefined;
if (diagnosticLayer !== undefined) report.diagnosticLayer = diagnosticLayer;
let bots = false, starting = false, screen, lastScreen = '', cameraTimer, thumbTimer, glowTimer;
const outbound = [];
const trackSend = type => { const at = Date.now(); outbound.push({ type, atSeconds: (at - started) / 1000 }); while (outbound.length && outbound[0].atSeconds < (at - started) / 1000 - 2) outbound.shift(); };
const sentRounds = new Set(), glowedRounds = new Set(), votedRounds = new Set();
const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (!finished) fn(); }, ms); timers.add(id); return id; };
const interval = (fn, ms) => { const id = setInterval(() => { if (!finished) fn(); }, ms); timers.add(id); return id; };
const send = m => { if (phone?.readyState === WebSocket.OPEN) { trackSend(m.t); phone.send(JSON.stringify({ t: 'msg', m })); } };
const control = m => { if (observer?.readyState === WebSocket.OPEN) observer.send(JSON.stringify(m)); };
const unique = (list, value) => { if (!list.includes(value)) list.push(value); };
function binary(header, payload) {
  trackSend(header.t);
  const h = Buffer.from(JSON.stringify(header)), frame = Buffer.alloc(4 + h.length + payload.length);
  frame.writeUInt32BE(h.length); h.copy(frame, 4); payload.copy(frame, 4 + h.length);
  phone.send(frame, () => frame.fill(0));
}
async function finish(error) {
  if (finished) return; finished = true;
  for (const id of timers) { clearInterval(id); clearTimeout(id); }
  observer?.close(); phone?.close();
  report.endedAt = new Date().toISOString(); report.durationSeconds = (Date.now() - started) / 1000;
  report.outcome = error ? 'FAIL' : 'PASS'; if (error) report.reason = error;
  for (const bytes of media) bytes.fill(0);
  await writeFile(process.env.DEVICE_CHECK_REPORT ?? '/tmp/snag-device-check.json', JSON.stringify(report, null, 2) + '\n');
  console.log(report.outcome, error ?? (homeOnly ? 'native photo-bearing Home recovery; full game completion outside this run' : diagnostic ? 'three rounds and native finale; no media persisted' : 'production protocol game complete; inspect native pictures/finale separately'));
  process.exitCode = error ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 500).unref();
}
if (deviceSerial) {
  try {
    const { stdout } = await execute('vega', ['device', 'run-cmd', '-d', deviceSerial, '-c', 'df -k /tmp'], { timeout: 15000, maxBuffer: 16384 });
    const row = stdout.split('\n').map(line => line.trim().split(/\s+/)).find(fields => fields.at(-1) === '/tmp');
    assert(row && Number.isFinite(Number(row[2])));
    report.devicePreflight = { tempUsedKiB: Number(row[2]), tempAvailableKiB: Number(row[3]) };
    assert(report.devicePreflight.tempUsedKiB <= 64 * 1024);
  } catch {
    await finish('Device temporary-memory preflight failed; clear owned completed test artifacts before acceptance');
    process.exit(1);
  }
}
async function nativeInstance() {
  const { stdout } = await execute('vega', ['device', 'run-cmd', '-d', deviceSerial, '-c', 'vlcm list'], { timeout: 15000, maxBuffer: 256 * 1024 });
  const row = stdout.split('\n').find(line => line.trim().startsWith('com.snagbrag.tv.main '))?.trim().split(/\s+/);
  return { pid: row?.[2], state: row?.[4] ?? 'NOT_RUNNING' };
}
const nativeCommand = command => execute('vega', ['device', 'run-cmd', '-d', deviceSerial, '-c', command], { timeout: 15000, maxBuffer: 16384 });
async function enterHome(snapshot) {
  homePending = true; homeDeadline = Date.now() + 45000;
  homeBefore = { ...await nativeInstance(), code: snapshot.code, round: snapshot.round, scene: snapshot.scene, photoDecodes: report.photoDecodes };
  assert.equal(homeBefore.state, 'VISIBLE');
  report.homeRecovery.attempted = true; report.homeRecovery.startedAtSeconds = (Date.now() - started) / 1000;
  console.log('Home recovery: background after native photo reveal');
  await nativeCommand('inputd-cli button_press KEY_HOMEPAGE');
  await new Promise(resolve => later(resolve, 12000));
  if (finished) return;
  const background = await nativeInstance(); assert.equal(background.pid, homeBefore.pid); assert.equal(background.state, 'NOT_VISIBLE');
  homeReturnStarted = true;
  await nativeCommand('vmsgr send orpheus://com.snagbrag.tv.main');
}
async function resumeHome(snapshot) {
  homeResumeSent = true;
  const foreground = await nativeInstance();
  assert.equal(foreground.pid, homeBefore.pid); assert.equal(foreground.state, 'VISIBLE');
  assert.equal(snapshot.code, homeBefore.code); assert.equal(snapshot.round, homeBefore.round); assert.equal(snapshot.scene, homeBefore.scene);
  report.homeRecovery.processPreserved = report.homeRecovery.roomPreserved = report.homeRecovery.scenePreserved = true;
  report.homeRecovery.audioRestored = true; report.homeRecovery.returnedPaused = true;
  await nativeCommand('inputd-cli button_press KEY_PLAYPAUSE');
}
function maybeDone() {
  if (awaitingRematch || !report.phoneCompleted || diagnostic && !report.nativeCompleted) return;
  try {
    assert.deepEqual(report.roundsSnagged, [0, 1, 2]);
    if (checkHome) assert(report.homeRecovery.completed);
    if (diagnostic) {
      assert(report.maskObserved && report.photoDecodes - gamePhotoStart >= 3);
      assert.equal(report.audioErrors.length, 0); assert.equal(report.exceptions.length, 0);
      assert((report.voicePaths.polly ?? 0) - gameVoiceStart > 0);
      assert.equal(latest.active, true);
      if (checkVideo) { assert(report.stageVideo.playingEvents > 0); assert.equal(report.stageVideo.errorEvents, 0); }
      for (const scene of ['intro', 'hunt', 'judge', 'stand', 'brag', 'show', 'champ']) assert(report.nativeScenes.includes(scene));
    }
    report.games.push({ durationSeconds: (Date.now() - gameStartedAt) / 1000, roundsSnagged: [...report.roundsSnagged], ...(diagnostic ? { nativeScenes: [...report.nativeScenes], photoDecodes: report.photoDecodes - gamePhotoStart, maskObserved: report.maskObserved, pollyLines: (report.voicePaths.polly ?? 0) - gameVoiceStart } : {}) });
    if (report.games.length >= gameCount) { void finish(); return; }
    awaitingRematch = true;
    later(() => {
      sentRounds.clear(); glowedRounds.clear(); votedRounds.clear(); lastScreen = '';
      report.roundsSnagged = []; report.nativeScenes = []; report.maskObserved = false;
      report.phoneCompleted = report.nativeCompleted = false; gamePhotoStart = report.photoDecodes; gameVoiceStart = report.voicePaths.polly ?? 0; gameStartedAt = Date.now();
      send({ t: 'again' }); console.log('Rematch', report.games.length + 1);
    }, 1500);
  } catch { void finish('Game completed but media/scene acceptance failed'); }
}
async function connectPhone(code) {
  connecting = true;
  const pixels = Buffer.alloc(720 * 720 * 3); media.push(pixels);
  for (let y = 0; y < 720; y++) for (let x = 0; x < 720; x++) {
    const i = (y * 720 + x) * 3, cup = x > 190 && x < 490 && y > 160 && y < 550;
    pixels[i] = cup ? 242 : 230 + (x + y) % 25;
    pixels[i + 1] = cup ? 59 : 225 + x % 25; pixels[i + 2] = cup ? 46 : 220 + y % 25;
  }
  const photo = await sharp(pixels, { raw: { width: 720, height: 720, channels: 3 } }).jpeg({ quality: 80 }).toBuffer();
  const thumb = await sharp(photo).resize(96, 64).jpeg().toBuffer(); media.push(photo, thumb);
  report.syntheticPhotoBytes = photo.length; report.syntheticThumbBytes = thumb.length;
  phone = new WebSocket(origin.replace('https:', 'wss:') + '/ws', { handshakeTimeout: 10000 });
  phone.on('open', () => phone.send(JSON.stringify({ t: 'hello', proto: 1, role: 'phone', code, cid: randomBytes(16).toString('hex') })));
  phone.on('error', () => void finish('Synthetic phone connection failed'));
  phone.on('message', (bytes, isBinary) => {
    if (isBinary || finished) return;
    let envelope; try { envelope = JSON.parse(String(bytes)); } catch { return; }
    if (envelope.t === 'error') { report.outboundAtError = [...outbound]; void finish('Relay rejected synthetic phone: ' + envelope.code); return; }
    if (envelope.t !== 'msg' || envelope.m.t !== 'screen') return;
    screen = envelope.m; const s = screen.s, key = screen.round + '/' + s.k;
    if (!diagnostic && awaitingRematch && s.k !== 'end') awaitingRematch = false;
    unique(report.phoneScreens, s.k);
    if (key !== lastScreen) { console.log('phone', key); lastScreen = key; }
    if (s.k !== 'cam') { clearInterval(thumbTimer); clearTimeout(cameraTimer); cameraTimer = undefined; thumbTimer = undefined; }
    if (s.k === 'join') {
      if (!diagnostic && s.takenColors.length) { void finish('Production test requires an empty room with only owned synthetic players'); return; }
      send({ t: 'join', name: 'Device Check', color: ['#FF4FA0', '#8B5CFF', '#FFD43B', '#F23B2E'].find(c => !s.takenColors.includes(c)) });
    }
    if (s.k === 'lobby' && s.isHost) {
      if (!bots) { bots = true; send({ t: 'bots', on: true }); }
      if (s.canStart && !starting) { starting = true; later(() => send({ t: 'start' }), capturePacing ? 10000 : 1100); }
    }
    if (s.k === 'cam' && !sentRounds.has(screen.round) && !cameraTimer) {
      const round = screen.round;
      thumbTimer = interval(() => binary({ t: 'thumb' }, thumb), 334);
      cameraTimer = later(() => {
        clearInterval(thumbTimer); thumbTimer = undefined;
        sentRounds.add(round); report.roundsSnagged.push(round);
        const prompt = screen.prompt, header = { t: 'snag', round, hex: '#F23B2E', match: 99,
          prompt: [prompt?.a, prompt?.b, prompt?.c].filter(Boolean).join(' '), roundKind: ['color', 'brag', 'show'][round], redaction: 'none' };
        if (round === 0) header.mask = Buffer.alloc(72, 255).toString('base64');
        binary(header, photo);
      }, 2400);
    }
    if (s.k === 'glow' && !s.aiPending && !glowedRounds.has(screen.round)) {
      glowedRounds.add(screen.round); clearTimeout(glowTimer);
      const submit = () => send({ t: 'glow', eyes: [[42, 42], [78, 42]], name: s.names[0] ?? 'Device Check', brag: s.brags[0] ?? 'Ready for the show.' });
      const waitForGlow = () => {
        if (latest?.phase === 'glow' && latest.round === screen.round) glowTimer = later(submit, 7000);
        else glowTimer = later(waitForGlow, 250);
      };
      glowTimer = later(capturePacing ? waitForGlow : submit, 1200);
    }
    if (s.k === 'vote' && !votedRounds.has(screen.round)) { votedRounds.add(screen.round); later(() => send({ t: 'vote', team: s.options[0].team }), capturePacing ? 7500 : 0); }
    if (s.k === 'end' && !awaitingRematch) { report.phoneCompleted = true; maybeDone(); }
  });
  interval(() => { if (screen?.s.k === 'mash' && screen.s.phase === 'mash') send({ t: 'tap', n: 1, side: screen.s.left.team.id === screen.me?.id ? -1 : 1 }); }, 110);
}
if (diagnostic) {
observer = new WebSocket('ws://127.0.0.1:8790/observe?runtime=native');
observer.on('error', () => void finish('Local native observer unavailable'));
observer.on('open', () => {
  if (reproductionSpeed !== 1) control({ command: 'reset', speed: reproductionSpeed, seed: 1 });
  control({ command: 'snapshot' });
  interval(() => {
    control({ command: 'snapshot' });
    if (homePending && Date.now() > homeDeadline) void finish('Native Home recovery timed out');
    else if (!homePending && Date.now() - lastSnapshot > 18000) void finish('Native snapshots stalled at ' + (latest ? latest.scene + '/' + latest.phase + '/' + latest.round : 'bootstrap'));
  }, 1000);
});
observer.on('message', bytes => {
  let m; try { m = JSON.parse(String(bytes)); } catch { return; }
  if (m.kind === 'exception') { report.exceptions.push({ source: m.source }); void finish('Native exception'); }
  if (m.kind === 'audio-error') report.audioErrors.push({ file: m.file, codec: m.codec, code: m.code });
  if (m.kind === 'audio-preloaded') audioReady = true;
  if (m.kind === 'relay-disconnected') report.disconnects.push({ atSeconds: (Date.now() - started) / 1000, code: m.code });
  if (m.kind === 'app-state') report.appStates.push({ atSeconds: (Date.now() - started) / 1000, state: m.status });
  if (m.kind === 'voice-line') report.voicePaths[m.path] = (report.voicePaths[m.path] ?? 0) + 1;
  if (m.kind === 'photo-decoded') report.photoDecodes++;
  if (m.kind === 'stage-video') {
    if (m.status === 'playing') report.stageVideo.playingEvents++;
    if (m.status === 'release-requested') report.stageVideo.releaseRequests++;
    if (m.status === 'error') { report.stageVideo.errorEvents++; if (checkVideo) void finish('Native stage video failed'); }
  }
  if ((m.kind === 'judge-mask' || m.kind === 'judge-mask-hold') && m.cells > 0) report.maskObserved = true;
  if (m.kind !== 'snapshot') return;
  audioReady ||= m.audio === true;
  if (connecting && m.active === false && !homePending) { void finish('Native app left the foreground during the game'); return; }
  report.maxSnapshotGapMs = Math.max(report.maxSnapshotGapMs, Date.now() - lastSnapshot); lastSnapshot = Date.now();
  if (!latest || latest.scene !== m.scene || latest.round !== m.round) console.log('TV', m.scene, m.phase, m.round);
  latest = m; unique(report.nativeScenes, m.scene);
  if (checkHome && !report.homeRecovery.attempted && !homePending && m.scene === 'judge' && report.photoDecodes > 0 && report.maskObserved) void enterHome(m).catch(() => finish('Native Home/background state was not preserved'));
  if (homePending && homeReturnStarted && !homeResumeSent && m.active && m.audio && m.paused && report.photoDecodes > homeBefore.photoDecodes) void resumeHome(m).catch(() => finish('Native warm return did not preserve the game'));
  if (homePending && homeResumeSent && m.active && m.audio && !m.paused) {
    homePending = false; report.homeRecovery.completed = true; report.homeRecovery.resumedAtSeconds = (Date.now() - started) / 1000;
    report.homeRecovery.photoDecodesAfterReturn = report.photoDecodes - homeBefore.photoDecodes;
    console.log('Home recovery: same process/room/scene, audio restored, real Play/Pause resumed');
    if (homeOnly) void finish(report.audioErrors.length || report.exceptions.length ? 'Native errors during Home recovery' : undefined);
  }
  if (awaitingRematch && !m.completed && m.scene === 'intro') awaitingRematch = false;
  if (m.exceptions) void finish('Native exception count increased');
  if (audioReady && m.ready && m.loaded && m.connected && m.active && m.scene === 'lobby' && m.teams === 0 && !connecting) {
    if (diagnosticLayer !== undefined && !layerApplied) { layerApplied = true; control({ command: 'diagnostic-layer', level: diagnosticLayer }); return; }
    void connectPhone(m.code).catch(() => finish('Synthetic phone setup failed'));
  }
  if (m.completed && !awaitingRematch) { report.nativeCompleted = true; maybeDone(); }
});
} else void connectPhone(visibleCode).catch(() => finish('Production phone setup failed'));
later(() => void finish('Device game timed out'), 120000 + gameCount * 600000);
if (deviceSerial) {
  let checking = false;
  interval(async () => {
    if (!connecting || checking) return;
    checking = true;
    try {
      const { stdout } = await execute('vega', ['device', 'run-cmd', '-d', deviceSerial, '-c', 'vlcm list\ncat /proc/meminfo'], { timeout: 15000, maxBuffer: 256 * 1024 });
      const row = stdout.split('\n').find(line => line.trim().startsWith('com.snagbrag.tv.main '));
      const state = row?.trim().split(/\s+/)[4] ?? 'NOT_RUNNING';
      const graphics = Object.fromEntries([...stdout.matchAll(/^(CmaTotal|CmaFree):\s*(\d+)/gm)].map(m => [m[1] === 'CmaFree' ? 'graphicsFreeKiB' : 'graphicsTotalKiB', Number(m[2])]));
      report.foregroundChecks.push({ atSeconds: (Date.now() - started) / 1000, state, ...graphics });
      if (state !== 'VISIBLE' && !(homePending && state === 'NOT_VISIBLE')) void finish('Lifecycle manager reports game ' + state);
    } catch { void finish('Could not verify native foreground state'); }
    finally { checking = false; }
  }, 20000);
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => void finish('Interrupted for further device fixes'));
