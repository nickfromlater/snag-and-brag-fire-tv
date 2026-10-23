// Synthetic-only 1080p layout checks. Uses local web, never device controls.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { inspectClarity } from './clarity-geometry.mjs';
const root = resolve(import.meta.dirname, '../..');
const puppeteer = createRequire(root + '/tv/package.json')('puppeteer-core');
const sharp = createRequire(root + '/relay/package.json')('sharp');
const { makePlan } = await import(pathToFileURL(root + '/tools/director/plan.mjs'));
const plan = makePlan(), out = root + '/docs/review/clarity', pass = process.argv[2] ?? 'after';
if(pass === 'before') throw new Error('Preserve the archived baseline.');
const only = process.argv.find(a => a.startsWith('--only='))?.slice(7).split(',');
const variants = process.argv.includes('--base-only') ? ['four'] : ['four', 'long-four', 'two', 'long-two'];
const phase = (r,p) => plan.events.find(e => e.kind === 'phase' && e.round === r && e.phase === p)?.atMs;
const beats = [
  ['01-lobby',6500], ['02-round-title',phase(0,'title')+2200], ['03-prompt-reel',plan.galleryBeats['prompt-reel']],
  ['04-countdown',phase(0,'countdown')+350], ['05-hunt',plan.beats['hunt-feeds']], ['06-snagged',phase(0,'hunt')+7600],
  ['07-glow-up',phase(0,'glow')+600], ['08-pixel-judge',plan.beats['pixel-judge-mask']], ['09-judge-winner',plan.galleryBeats['judge-win']],
  ['10-standings',phase(0,'standings')+4900], ['11-brag-lines',phase(1,'brag-lines')+2200], ['12-brag-mash',plan.beats['brag-final-mash']],
  ['13-brag-knockout',phase(1,'knockout')+1400], ['14-show-vote',phase(2,'vote')+2500], ['15-show-winner',plan.galleryBeats['showstopper-win']],
  ['16-finale',plan.galleryBeats.finale], ['17-round-2-title',phase(1,'title')+2200], ['18-round-3-title',phase(2,'title')+2200],
  ['19-round-2-hunt',phase(1,'hunt')+1800], ['20-round-3-hunt',phase(2,'hunt')+1800],
];
await mkdir(out+'/'+pass, {recursive:true});
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--mute-audio','--force-color-profile=srgb']});
try {
  const page = await browser.newPage(), errors = [], captured = [], checks = [];
  page.on('pageerror',e => errors.push(e.message));
  await page.setViewport({width:1920,height:1080,deviceScaleFactor:1});
  await page.goto('http://127.0.0.1:5174');
  await page.waitForFunction(() => !!window.__snagTv);
  await page.evaluate(() => {
    const s=window.__snagTv;s.stopped=true;clearTimeout(s.controlRetry);s.control?.close();s.relay?.close(false);
    s.command({command:'reset',speed:1});s.command({command:'frame-debug',on:false});
  });
  await page.waitForFunction(() => window.__snagTv.ready && document.fonts.check('27px Rubik'));
  await new Promise(r => setTimeout(r,1200));
  await page.evaluate(async root => {
    const m=await import('/@fs/'+root+'/shared/src/index.ts');window.__clarity={m};
    const s=window.__snagTv;s.game.dispose();s.clock.now=()=>window.__clarity.clock?.now()??0;
    const {particleEngine}=await import('/src/stage/particles.ts');particleEngine.clear();
  },root);
  for(const variant of variants) for(const [name,at] of beats) {
    if(only && !only.some(n=>name.startsWith(n))) continue;
    if(!Number.isFinite(at)) throw new Error(name+' missing beat');
    const state=await page.evaluate(({at,variant}) => {
      const {m}=window.__clarity,s=window.__snagTv;window.__clarity.game?.dispose();
      const clock=new m.ShowcaseClock(),game=new m.GameHost({clock,rng:m.seededRng(20261022),showcase:m.createShowcase(20261022),room:{code:'K7QF',joinUrl:'https://d2q0olvpmfmvjn.cloudfront.net/?r=K7QF'},send:()=>{},cue:()=>{}});
      window.__clarity.clock=clock;window.__clarity.game=game;game.playShowcase();clock.advanceTo(at);
      const v=structuredClone(game.getView());
      if(variant.includes('two')) {
        const ids=v.content.k==='brag'?[v.content.match.left,v.content.match.right]:[v.content.winner??v.teams[0].id,v.teams.find(t=>t.id!==(v.content.winner??v.teams[0].id)).id];
        v.teams=v.teams.filter(t=>ids.includes(t.id));v.feeds=v.feeds.filter(f=>ids.includes(f.team));
        const c=v.content;
        for(const k of ['ranking','previous','snagOrder']) if(Array.isArray(c[k])) c[k]=c[k].filter(id=>ids.includes(id));
        if(c.cards)c.cards=c.cards.filter(card=>ids.includes(card.find.team));
        if(c.pedestals)c.pedestals=c.pedestals.filter(p=>ids.includes(p.find.team)).map(p=>({...p,voters:p.voters.filter(id=>ids.includes(id))}));
      }
      if(variant.startsWith('long')) {
        const replacements={};v.teams.forEach((t,i)=>{replacements[t.name]=['WWWWWWWWWWWWWWWWWWWW','MMMMMMMMMMMMMMMMMMMM','The Maximum Name Co.','Grandmas Big Revenge'][i];});
        const findNames=new Set(v.feeds.map(f=>f.find?.name).filter(Boolean));
        for(const n of findNames) replacements[n]='WWWWWWWWWWWWWWWWWW';
        const replace=x=>{if(typeof x==='string'){for(const [a,b] of Object.entries(replacements))x=x.replaceAll(a,b);return x;}if(Array.isArray(x))return x.map(replace);if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,replace(v)]));return x;};
        Object.assign(v,replace(v));
      }
      s.view={...v,paused:false,menu:null,sound:false,music:false,voice:false};s.room={code:'K7QF',joinUrl:'https://d2q0olvpmfmvjn.cloudfront.net/?r=K7QF'};s.hostEvent=undefined;s.presentationRevision++;s.notify();
      return {scene:v.scene,phase:v.phase,round:v.round,completed:v.completed};
    },{at,variant});
    // Initialize existing seconds displays, then hold all authoritative poses.
    await new Promise(r=>setTimeout(r,80));
    await page.evaluate(()=>{const s=window.__snagTv;s.view={...s.view,paused:true};s.notify();});
    await new Promise(r=>setTimeout(r,250));
    const check=await page.evaluate(inspectClarity);
    checks.push({name,variant,...check});captured.push({name,variant,at,...state});
    if(process.argv.includes('--audit-only')) {}
    else if(variant==='four') await page.screenshot({path:out+'/'+pass+'/'+name+'.png'});
    else {await mkdir(out+'/'+pass+'/variants',{recursive:true});await sharp(await page.screenshot()).resize(480,270).png().toFile(out+'/'+pass+'/variants/'+variant+'-'+name+'-10ft.png');}
    console.log(variant+' '+name+': '+check.issues.length+' issues / '+check.texts+' labels');
  }
  // Prove that the audit rejects real faults instead of merely producing a clean receipt.
  await page.evaluate(()=>{
    const root=document.querySelector('[data-testid="clarity-scene"]');
    const probe=document.createElement('div');probe.id='clarity-audit-probe';probe.style.cssText='position:absolute;left:300px;top:150px;width:400px;height:150px';
    for(let i=0;i<2;i++){const t=document.createElement('div');t.dir='auto';t.textContent='AUDIT COLLISION';t.style.cssText='position:absolute;left:0;top:0;width:200px;height:40px;font:24px Rubik';probe.append(t);}
    const t=document.createElement('div');t.dir='auto';t.textContent='AUDIT OVERFLOW';t.style.cssText='position:absolute;left:220px;top:0;width:10px;height:10px;overflow:hidden;white-space:nowrap;font:24px Rubik';probe.append(t);
    const crown=document.createElement('div');crown.setAttribute('aria-label','Winner crown');crown.style.cssText='position:absolute;left:0;top:0;width:60px;height:60px';probe.append(crown);root.append(probe);
  });
  const guard=await page.evaluate(inspectClarity);
  await page.evaluate(()=>document.getElementById('clarity-audit-probe').remove());
  const detected=['overflow','text-overlap','avatar/crown-overlap'].filter(kind=>guard.issues.some(i=>i.kind===kind));
  if(detected.length!==3)throw new Error('Geometry guard failed its injected-fault check');
  await writeFile(out+'/beats.json',JSON.stringify(beats,null,2)+'\n');
  const issueCount=checks.reduce((n,c)=>n+c.issues.length,0);
  const report={resolution:[1920,1080],scope:'scene text plus HUD/host/crown/avatar obstacles; HUD, host and ticker excluded from four-block quota; wholly offscreen reel cards excluded',tolerancePx:1,states:checks.length,issueCount,errors,guard:{passed:true,detected},checks};
  await writeFile(out+'/'+pass+'/geometry.json',JSON.stringify(report,null,2)+'\n');
  await writeFile(out+'/'+pass+'/receipt.json',JSON.stringify({fixture:'deterministic synthetic showcase, 20-character team names / 18-character object names, 2 and 4 teams',resolution:[1920,1080],photos:'reference object art only',held:true,captured,errors,issueCount},null,2)+'\n');
  if(errors.length || issueCount) throw new Error(issueCount+' layout issues; '+errors.length+' browser exceptions; see '+pass+'/geometry.json');
} finally {await browser.close();}
