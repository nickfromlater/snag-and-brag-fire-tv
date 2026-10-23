import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { createShowcase, seededRng, showcaseJudgeMask, OBJI } from './shared.mjs';
import { chrome, repo } from './lib.mjs';

/** Fail closed if the reference changes: these hooks never edit the source bundle. */
export function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw new Error(`Reference hook no longer unique: ${before.slice(0, 64)}`);
  return source.replace(before, () => after);
}
export async function showcaseHtml(seed = 20261022, speed = 1) {
  if (![1, 2, 4].includes(speed)) throw new Error('Web rehearsal speed must be 1, 2 or 4');
  const script = createShowcase(seed).script;
  const [html, raw] = await Promise.all([readFile(join(repo, 'reference/mockup/snag-and-brag.html'), 'utf8'), readFile(join(repo, 'reference/src/game.js'), 'utf8')]);
  if (!html.includes(raw.trim())) throw new Error('Bundled mockup differs from reference/src/game.js');
  let source = raw;
  source = replaceOnce(source, 'P:choosePrompt(R.kind)', 'P:directorScript.rounds[r].prompt');
  source = replaceOnce(source, 'await sleep(rnd(700,1200))', 'await sleep(directorScript.joinMs[i]-directorScript.joinMs[i-1])');
  source = replaceOnce(source, 'times=shuffle([rnd(4,8),rnd(10,17),rnd(17,27)])', 'times=directorScript.rounds[G.r].finds.slice(1).map(function(f){return f.snagMs/1000;})');
  source = replaceOnce(source, 'await phase(HUNT_S*1000', 'setTimeout(function(){CAM.snag(OBJI[directorScript.rounds[G.r].finds[0].obj],false);},directorScript.rounds[G.r].finds[0].snagMs);\n  await phase(HUNT_S*1000');
  source = replaceOnce(source, '300+i*350);});\n  if(!G.sent)', '650+i*350);});\n  setTimeout(function(){GLOW.send(false);},300);\n  if(!G.sent)');
  source = replaceOnce(source, 'clamp(colorMatch(f.col,P.hex)+ri(-3,2),2,99)', 'colorMatch(f.col,P.hex)');
  source = replaceOnce(source, 'var foe=pick(ids.slice(1))', 'var foe=ids[directorScript.bracket[0][1]]');
  source = replaceOnce(source, 'p=clamp(p,-1,1);MASH.p=p;', 'p=directorPosition(el,!!M.final,directorScript.matchWinners[directorMatches-1]===G.teams.indexOf(tl)?-1:1);MASH.p=p;');
  source = replaceOnce(source, 'at:rnd(1.5,7.5),done:false', 'at:directorScript.voteMs[G.teams.indexOf(t)]/1000,done:false');
  const masks = Object.fromEntries(script.rounds[0].finds.map(f => [f.obj, showcaseJudgeMask(OBJI[f.obj].col, script.rounds[0].prompt.hex)]));
  // Capture policy: no real camera, no AI, no network, no audible WebAudio.
  const hooks = `
var directorScript=${JSON.stringify(script)},directorMasks=${JSON.stringify(masks)},directorOrigin=0,directorSeq=0,directorMatches=0,directorFirstScan=true;
function directorMark(kind,data){var e=Object.assign({seq:++directorSeq,atMs:Math.max(0,(performance.now()-directorOrigin)/${speed}),round:G?G.r:-1,kind:kind},data||{});window.__directorCue(e);}
function directorBeat(name,delay){setTimeout(function(){directorMark('beat',{name:name});},delay);}
function directorPosition(ms,final,side){var t=Math.max(0,Math.min(1,ms/6000));return side*(final?.1:.38)*Math.pow(t,3)+.13*Math.sin(t*Math.PI*8)*Math.sin(t*Math.PI);}
botFind=function(t,P){var s=directorScript.rounds[G.r].finds[G.teams.indexOf(t)],o=OBJI[s.obj];return newFind(t,o,{name:o.names[s.name],brag:o.brags[s.brag]});};
var directorGlow=GLOW.open;GLOW.open=function(f){directorGlow(f);var s=directorScript.rounds[G.r].finds[0],o=OBJI[s.obj];GLOW.names([o.names[s.name]].concat(o.names.filter(function(n){return n!==o.names[s.name];})));GLOW.brags([o.brags[s.brag]].concat(o.brags.filter(function(n){return n!==o.brags[s.brag];})));};
var directorScene=scene;scene=function(name,o){directorMark('scene',{scene:name});if(name==='brag')directorMatches++;return directorScene(name,o).then(function(){if(name==='hunt'&&G.r===0)directorBeat('hunt-feeds',1800);});};
var directorPhase=phase;phase=function(ms,tick){var p=ms===35000?'hunt':ms===15000?'glow':ms===6000?'mash':ms===10000?'vote':'wait';directorMark('phase',{phase:p});if(p==='mash'&&directorMatches===3)directorBeat('brag-final-mash',2400);if(p==='vote')setTimeout(function(){castVote(G.you,G.cur.finds[G.teams[directorScript.voteFor[0]].id]);},directorScript.voteMs[0]);return directorPhase(ms,tick);};
var directorVote=castVote;castVote=function(voter,f){return directorVote(voter,G.cur.finds[G.teams[directorScript.voteFor[G.teams.indexOf(voter)]].id]);};
pixScan=function(cv,col){cv.width=cv.height=96;var ctx=cv.getContext('2d'),bits=atob(directorMasks[G.cur.finds[G.teams.find(function(t){return cv.closest('.jcard').id==='jc-'+t.id;}).id].obj]);var lit=0;ctx.clearRect(0,0,96,96);for(var i=0;i<576;i++){if(bits.charCodeAt(i>>3)&(1<<(i&7))){ctx.fillStyle='#B8F23B';ctx.fillRect((i%24)*4,Math.floor(i/24)*4,3,3);lit++;}}cv.dataset.litCells=String(lit);A(cv,[{opacity:0},{opacity:.88,offset:.15},{opacity:.88,offset:.7},{opacity:0}],{d:900});directorMark('scan');if(directorFirstScan){directorFirstScan=false;directorBeat('pixel-judge-mask',350);}};
var directorSlam=slam;slam=function(el,o){var result=directorSlam(el,o);if(el&&el.id==='ch-name')directorBeat('finale',1600);if(el&&el.classList.contains('ribbon')&&el.textContent==='SHOWSTOPPER')directorBeat('showstopper-win',1100);return result;};
var directorChamp=champFlow;champFlow=async function(){await directorChamp();directorMark('complete');};
window.__DIRECTOR={start:function(){directorOrigin=performance.now();boot(false);directorBeat('lobby',6500);setTimeout(function(){tname.value='Sock Goblins';$('#b-join').click();},directorScript.joinMs[0]);setTimeout(function(){if(!G._start)throw new Error('Showcase start cue arrived before lobby ready');G._start();},directorScript.startMs);requestAnimationFrame(frame);return {epochMs:performance.timeOrigin+directorOrigin/${speed}};},thumbnail:function(){['#hud','#host','#bubble','#ticker','#joincard','#parade','#tvfx','#wipe','#tvflash'].forEach(function(s){var el=$(s);if(el)el.style.display='none';});var logo=$('#lgstack');logo.style.cssText='left:255px;top:56px;transform:scale(1.04);transform-origin:50% 50%';['#lgs','#lga','#lgb','#lgt'].forEach(function(s){$(s).getAnimations().forEach(function(a){a.cancel();});$(s).style.opacity=1;});$('#lgt').style.left='114px';var stage=$('#sc-lobby');[['duck',70,60,180,-16],['crown',1000,44,160,16],['donut',78,310,160,-12],['glove',1030,285,165,12],['sock',275,552,150,-10],['dino',847,530,170,8],['lava',570,562,130,5]].forEach(function(a){var el=sticker({obj:a[0],eyes:OBJI[a[0]].eyes});el.style.cssText='position:absolute;left:'+a[1]+'px;top:'+a[2]+'px;width:'+a[3]+'px;height:'+a[3]+'px;transform:rotate('+a[4]+'deg)';stage.appendChild(el);});}};
`;
  source = replaceOnce(source, 'boot(false);\nrequestAnimationFrame(frame);', hooks);
  const seeded = `(${seededRng.toString()})(${seed})`;
  const guard = `<script>(function(){Math.random=${seeded};window.claude=undefined;window.AudioContext=undefined;window.webkitAudioContext=undefined;${speed === 1 ? '' : `const st=setTimeout,si=setInterval,raf=requestAnimationFrame,now=performance.now.bind(performance),ani=Element.prototype.animate;window.setTimeout=(f,ms,...a)=>st(f,(ms||0)/${speed},...a);window.setInterval=(f,ms,...a)=>si(f,Math.max(4,(ms||0)/${speed}),...a);Object.defineProperty(performance,'now',{value:()=>now()*${speed}});window.requestAnimationFrame=f=>raf(n=>f(n*${speed}));Element.prototype.animate=function(frames,o){if(typeof o==='object')o={...o,duration:o.duration/${speed},delay:(o.delay||0)/${speed}};return ani.call(this,frames,o);};`}})();</script>`;
  const css = `<style>html,body{margin:0!important;padding:0!important;width:1920px!important;height:1080px!important;overflow:hidden!important}.appbar,.phcol,.cap,#err{display:none!important}.stage,.tvcol,.tvframe{display:block!important;position:static!important;margin:0!important;padding:0!important;max-width:none!important;width:1920px!important;height:1080px!important;border:0!important;border-radius:0!important;box-shadow:none!important}.tvbox{position:absolute!important;left:0!important;top:0!important;width:1920px!important;height:1080px!important;aspect-ratio:auto!important;border-radius:0!important}#tv{--s:1.5!important}#joincard .jn{font-size:16px}.jart .pix{z-index:3}</style>`;
  return guard + html.replace(raw.trim(), () => source.trim()).replace('Two to eight teams.', 'Two to four teams.') + css;
}

export async function openWeb({ seed = 20261022, speed = 1, onCue = () => {} } = {}) {
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--mute-audio', '--force-color-profile=srgb', '--disable-background-timer-throttling'] });
  try {
    const page = await browser.newPage(); await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    const errors = [];
    await page.setRequestInterception(true);
    page.on('request', r => /^(data:|blob:|about:)/.test(r.url()) ? void r.continue() : void r.abort());
    page.on('pageerror', error => errors.push(error.message));
    await page.exposeFunction('__directorCue', onCue);
    await page.setContent(await showcaseHtml(seed, speed), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    if (errors.length) throw new Error(errors.join('\n'));
    const fonts = await page.evaluate(() => document.fonts.check('100px "Lilita One"') && document.fonts.check('500 30px Rubik'));
    if (!fonts) throw new Error('Bundled display/UI fonts did not load');
    const start = () => page.evaluate(() => window.__DIRECTOR.start());
    return { browser, page, errors, start, close: () => browser.close() };
  } catch (error) { await browser.close(); throw error; }
}

export async function verifyWebBeat(page, name) {
  return page.evaluate(name => {
    const g = window.__SB.G(), scene = document.querySelector('.scn.on').id;
    const result = { name, scene, okay: false };
    if (name === 'lobby') result.okay = scene === 'sc-lobby' && ['lgs', 'lgb', 'joincard'].every(id => Number(getComputedStyle(document.getElementById(id)).opacity) > .9);
    else if (name === 'hunt-feeds') result.okay = scene === 'sc-hunt' && document.querySelectorAll('.feed').length === 4;
    else if (name === 'pixel-judge-mask') {
      const mask = document.querySelector('.pix[data-lit-cells]'); result.litCells = Number(mask?.dataset.litCells ?? 0);
      const box = mask?.getBoundingClientRect(); if (box) result.maskBox = { x: Math.ceil(box.x), y: Math.ceil(box.y), width: Math.floor(box.width), height: Math.floor(box.height) };
      result.opacity = mask ? Number(getComputedStyle(mask).opacity) : 0;
      result.okay = scene === 'sc-judge' && result.litCells > 0 && result.opacity > .5;
    }
    else if (name === 'brag-final-mash') { result.okay = scene === 'sc-brag' && document.querySelector('#sc-brag .bk').textContent === 'THE FINAL' && window.__SB.MASH().on; result.position = window.__SB.MASH().p; }
    else if (name === 'showstopper-win') { result.votes = g.cur.finds.you.votes; result.okay = scene === 'sc-show' && !!document.querySelector('.holostk') && result.votes === 2; }
    else if (name === 'finale') result.okay = scene === 'sc-champ' && document.querySelector('#ch-name').textContent === 'Sock Goblins' && g.teams[0].score === 429;
    return result;
  }, name);
}

/** Hold just the 900ms mask/800ms beam while Chrome encodes a PNG. Other scenes
 * keep running; normal games never load this capture adapter. */
export async function takeWebStill(page, name, file) {
  if (name === 'pixel-judge-mask') await page.evaluate(async () => {
    for (const element of [document.querySelector('.pix[data-lit-cells]'), document.querySelector('.jcard .scanbeam')])
      for (const animation of element?.getAnimations() ?? []) {
        animation.pause(); await animation.ready;
        // The mask uses the reference's fast cubic ease-out: 20% of clock time
        // lies on its .88-opacity plateau. The beam uses ease-in-out.
        animation.currentTime = Number(animation.effect.getTiming().duration) * (element.matches('.pix') ? .2 : 350 / 800);
      }
    await new Promise(resolve => requestAnimationFrame(resolve));
  });
  try {
    const check = await verifyWebBeat(page, name); if (!check.okay) throw new Error(`Gallery beat not visible: ${JSON.stringify(check)}`);
    await page.screenshot({ path: file, type: 'png' }); return check;
  } finally {
    if (name === 'pixel-judge-mask') await page.evaluate(() => {
      for (const element of [document.querySelector('.pix[data-lit-cells]'), document.querySelector('.jcard .scanbeam')])
        for (const animation of element?.getAnimations() ?? []) if (animation.playState === 'paused') animation.play();
    });
  }
}
