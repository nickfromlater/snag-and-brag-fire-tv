import './style.css';
import './adapt.css';
import { roomCode, relayUrl } from './logic';
import { PhoneView } from './view';
import { RelayTransport } from './transport';
import type { PhoneTransport, TransportEvents } from './transport';
import type { ScreenMsg } from '@snag/shared';

const root = document.querySelector<HTMLElement>('#app')!;
const query = new URLSearchParams(location.search);

function enterCode(error = ''): void {
  root.innerHTML = `<form class="code-entry"><span class="brand">SNAG &amp; BRAG</span><span class="kick y">Your show awaits</span><h1 class="h1">Got a <em>room code</em>?</h1><p class="sub">Find the four letters on the TV. Two to four teams. One phone each.</p><div class="code-tiles" aria-label="Four-letter room code">${[1, 2, 3, 4].map((n) => `<input aria-label="Room code letter ${n}" maxlength="1" pattern="[A-Za-z]" autocomplete="off" autocapitalize="characters" inputmode="text" required>`).join('')}</div><p class="sub" id="code-error" role="status"></p><button class="btn pk" type="submit">Find the show</button></form>`;
  root.querySelector('#code-error')!.textContent = error;
  const inputs = [...root.querySelectorAll<HTMLInputElement>('.code-tiles input')];
  inputs.forEach((input, i) => {
    input.oninput = () => { input.value = input.value.replace(/[^a-z]/gi, '').toUpperCase(); if (input.value) inputs[i + 1]?.focus(); };
    input.onkeydown = (e) => { if (e.key === 'Backspace' && !input.value) inputs[i - 1]?.focus(); };
    input.onpaste = (e) => {
      const pasted = e.clipboardData?.getData('text') ?? '', code = roomCode(pasted); if (!code) return;
      e.preventDefault(); inputs.forEach((field, i) => field.value = code[i]!); inputs[3]!.focus();
    };
  });
  root.querySelector('form')!.onsubmit = (e) => {
    e.preventDefault(); const code = roomCode(inputs.map((i) => i.value).join(''));
    if (!code) { root.querySelector('#code-error')!.textContent = 'Four letters, just like on the TV.'; return; }
    const url = new URL(location.href); url.searchParams.set('r', code); location.assign(url.href);
  };
}

async function boot(): Promise<void> {
  if (import.meta.env.DEV && query.has('gallery')) {
    const { SCREEN_KEYS, FIXTURE_LABELS } = await import('../dev/fixtures');
    document.body.classList.add('gallery-mode');
    root.innerHTML = `<div class="gallery">${SCREEN_KEYS.map((key, i) => `<figure><figcaption>${i + 1}. ${FIXTURE_LABELS[i]}</figcaption><iframe title="${FIXTURE_LABELS[i]}" src="/?fixture=${key}&r=K7QF"></iframe></figure>`).join('')}</div>`;
    return;
  }
  if (import.meta.env.DEV && query.has('fixture')) {
    const { fixture, SCREEN_KEYS, syntheticScene } = await import('../dev/fixtures');
    const { FixtureTransport, newReceipt } = await import('../dev/fake-tv');
    const key = query.get('fixture'); if (!SCREEN_KEYS.includes(key as typeof SCREEN_KEYS[number])) { enterCode('Unknown review screen.'); return; }
    document.body.classList.add('fixture-mode'); const now = Date.now(); const receipt = newReceipt(); window.__phoneReview = receipt;
    const view = new PhoneView(root, new FixtureTransport(now), 'K7QF', { fixture: true }); view.apply(fixture(key as typeof SCREEN_KEYS[number], now));
    if (key === 'cam') { view.fixtureCamera(syntheticScene()); view.receive({ t: 'toast', text: 'Couch Potatoes snagged the rubber glove', color: '#FF7A1F' }); }
    if (key === 'glow') view.fixtureEyes();
    if (key === 'mash') view.get('mgrid').querySelector('[data-side="-1"] .tap')!.textContent = '30';
    receipt.inspect = () => ({ screen: view.screen?.s.k ?? null, cameraReady: view.camera.ready, cameraActive: !!view.get<HTMLVideoElement>('camera').srcObject, seq: view.screen?.seq ?? 0 });
    receipt.inject = (message) => view.receive(message);
    return;
  }
  const fake = import.meta.env.DEV && query.has('fake');
  const code = roomCode(query.get('r') ?? '') ?? (fake ? 'FAKE' : null);
  if (!code) { enterCode(query.has('r') ? 'Check the four-letter room code on the TV.' : ''); return; }
  let view: PhoneView;
  let transport: PhoneTransport;
  let ended = false;
  const events: TransportEvents = { message: (m) => view.receive(m), ai: (m) => view.ai(m), status: (s) => view.status(s), closed: reason => { ended = true; view.roomClosed(); view.destroy(); enterCode(reason ?? 'That show has closed. Check the code on the TV.'); } };
  let receipt: import('../dev/fake-tv').ReviewReceipt | undefined;
  if (fake) {
    const { FakeTv, newReceipt } = await import('../dev/fake-tv'); receipt = newReceipt(); window.__phoneReview = receipt;
    transport = new FakeTv(events, receipt, query.has('fast'));
  } else {
    try { transport = new RelayTransport(relayUrl(query.get('relay'), location), code, events); }
    catch { enterCode('The relay link must start with ws:// or wss://.'); return; }
  }
  view = new PhoneView(root, transport, code, { seen: (message) => {
    if (receipt) {
      if (!receipt.seen.includes(message.s.k)) receipt.seen.push(message.s.k);
      if (!receipt.rounds.includes(message.round)) receipt.rounds.push(message.round);
    }
  } });
  // A connection starts with a usable join card while waiting for the TV's screen.
  const initial: ScreenMsg = { t: 'screen', seq: -1, me: null, teams: [], round: -1, paused: false, s: { k: 'join', suggestedName: 'Sock Goblins', takenColors: [], full: false } };
  view.apply(initial);
  if (receipt) {
    receipt.inspect = () => ({ screen: view.screen?.s.k ?? null, cameraReady: view.camera.ready, cameraActive: !!view.get<HTMLVideoElement>('camera').srcObject, seq: view.screen?.seq ?? 0 });
    receipt.inject = (message) => view.receive(message);
  }
  transport.start();
  document.addEventListener('visibilitychange', () => { if (ended) return; if (document.hidden) view.sleep(); else { transport.reconnect(); view.wake(); } });
  window.addEventListener('pageshow', () => { if (!ended) { transport.start(); view.wake(); } });
  window.addEventListener('pagehide', () => { view.sleep(); transport.stop(); });
  window.addEventListener('error', () => { receipt?.errors.push('Browser error'); view.status('A little snag. Refresh to rejoin the show.'); });
  window.addEventListener('unhandledrejection', () => { receipt?.errors.push('Unhandled rejection'); view.status('A little snag. Refresh to rejoin the show.'); });
}

void boot();
