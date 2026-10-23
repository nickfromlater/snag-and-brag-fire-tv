// Thumbnail v2 uses only the director composition, bundled host parts and art.
import { readFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openWeb } from './web.mjs';
import { repo, wait } from './lib.mjs';

export async function thumbnailV2(file) {
  const { parts } = JSON.parse(await readFile(join(repo, 'assets/host/parts.json'), 'utf8'));
  const glove = 'data:image/png;base64,' + (await readFile(join(repo, 'assets/stickers/glove-384.png'))).toString('base64');
  const glee = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -25 240 290"><g transform="rotate(-5 100 240)"><g transform="translate(0 7)">${parts.lower}</g>${parts.mouth.replace('ry="3"', 'ry="9.5"').replace('cy="131"', 'cy="133"')}${parts.tongue.replace('ry="2"', 'ry="3"').replace('cy="134"', 'cy="138.5"')}<g transform="translate(0 -2.5)">${['upper', 'white-left', 'white-right', 'pupil-left', 'pupil-right', 'lid-left-closed', 'lid-right-closed', 'happy', 'brow-up-left', 'brow-up-right', 'monocle'].map(id => parts[id]).join('')}</g></g></svg>`.replaceAll('sx-', 'thumbnail-sx-');
  const host = 'data:image/svg+xml;base64,' + Buffer.from(glee).toString('base64');
  const web = await openWeb();
  try {
    await web.start(); await wait(1500);
    await web.page.evaluate(() => window.__DIRECTOR.thumbnail());
    await web.page.evaluate(({ host, glove }) => {
      const style = document.createElement('style'); style.textContent = 'html,body,.stage,.tvcol,.tvframe,.tvbox{width:1500px!important;height:1000px!important}#tv{height:853.333px!important;--s:1.171875!important}#tvbg,#world,#tvin{height:853.333px!important}#tvbg{object-fit:cover}#lgt{font-size:24px}'; document.body.append(style);
      const stage = document.querySelector('#sc-lobby');
      // Retain the original seven stickers. Move only the lower-left sock to
      // leave a clear silhouette for the new phone and host.
      const sock = [...stage.children].find(el => el.classList.contains('stk') && el.style.left === '275px'); if (sock) { sock.style.left = '443px'; sock.style.top = '662px'; sock.style.width = sock.style.height = '130px'; }
      document.querySelector('#lgstack').style.zIndex = '4';
      const add = (html, css) => { const box = document.createElement('div'); box.style.cssText = 'position:absolute;' + css; box.innerHTML = html; stage.append(box); };
      add(`<img src="${host}" style="width:100%;height:100%;filter:drop-shadow(9px 10px 0 #0E0B2B)"/>`, 'left:-15px;top:506px;width:270px;height:326px;transform:rotate(-6deg)');
      const photo = (x, y, size, angle) => `<g transform="translate(${x} ${y}) rotate(${angle} ${size / 2} ${size / 2})"><rect x="0" y="8" width="${size}" height="${size}" rx="18" fill="#0E0B2B"/><rect width="${size}" height="${size}" rx="18" fill="#FFF8EC" stroke="#0E0B2B" stroke-width="5"/><rect x="10" y="10" width="${size - 20}" height="${size - 20}" rx="12" fill="#FFD43B"/><image href="${glove}" x="-12" y="-16" width="${size + 24}" height="${size + 24}"/><g transform="translate(${size * .38} ${size * .52})"><ellipse rx="${size * .085}" ry="${size * .1}" fill="white" stroke="#0E0B2B" stroke-width="3"/><ellipse cx="${size * .19}" cy="-2" rx="${size * .085}" ry="${size * .1}" fill="white" stroke="#0E0B2B" stroke-width="3"/><circle cy="4" r="${size * .04}" fill="#0E0B2B"/><circle cx="${size * .19}" cy="2" r="${size * .04}" fill="#0E0B2B"/></g></g>`;
      add(`<svg viewBox="0 0 250 330" style="width:100%;height:100%;overflow:visible"><rect x="28" y="18" width="184" height="296" rx="28" fill="#0E0B2B"/><rect x="20" y="8" width="184" height="296" rx="28" fill="#FFF8EC" stroke="#0E0B2B" stroke-width="8"/><rect x="34" y="44" width="156" height="210" rx="12" fill="#2B3BFF" stroke="#0E0B2B" stroke-width="4"/><rect x="83" y="22" width="60" height="7" rx="3.5" fill="#0E0B2B"/><circle cx="112" cy="280" r="10" fill="#FFD43B" stroke="#0E0B2B" stroke-width="4"/>${photo(47, 78, 132, 7)}</svg>`, 'left:235px;top:566px;width:220px;height:282px;transform:rotate(-15deg)');
      add(`<svg viewBox="0 0 370 340" style="width:100%;height:100%;overflow:visible"><path d="M40 290Q120 230 118 145Q116 80 285 15" fill="none" stroke="#0E0B2B" stroke-width="11" stroke-linecap="round" stroke-dasharray="13 19"/><path d="M40 290Q120 230 118 145Q116 80 285 15" fill="none" stroke="#FFD43B" stroke-width="5" stroke-linecap="round" stroke-dasharray="13 19"/>${photo(115, 125, 156, 17)}<path d="M273 40L292 10L256 14" fill="none" stroke="#0E0B2B" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M273 40L292 10L256 14" fill="none" stroke="#FFD43B" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`, 'left:332px;top:399px;width:350px;height:322px');
    }, { host, glove });
    await web.page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 });
    await web.page.evaluate(async () => { await Promise.all([...document.images].map(i => i.decode().catch(() => {}))); });
    await mkdir(dirname(file), { recursive: true }); await web.page.screenshot({ path: file, type: 'png' });
    if (web.errors.length) throw new Error(web.errors.join('\n'));
    if ((await stat(file)).size > 1_500_000) throw new Error('Thumbnail exceeds 1.5 MB');
  } finally { await web.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = resolve(process.argv[2] ?? join(repo, 'docs/gallery/thumbnail.png')); await thumbnailV2(file); console.log('1500×1000 project-art thumbnail: ' + file);
}
