// Normal-speed browser smoke pass. All bots, reference art, muted, no device control.
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const out=resolve(import.meta.dirname,'../../docs/review/clarity/live');
await mkdir(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--mute-audio']});
try {
  const page=await browser.newPage(), errors=[], phases=[], scenes=new Set();
  page.on('pageerror',e=>errors.push(e.message));
  await page.setViewport({width:1920,height:1080,deviceScaleFactor:1});
  await page.goto('http://127.0.0.1:5174');await page.waitForFunction(()=>!!window.__snagTv);
  await page.evaluate(()=>{const s=window.__snagTv;s.stopped=true;clearTimeout(s.controlRetry);s.control?.close();s.relay?.close(false);s.command({command:'reset',speed:1});s.command({command:'frame-debug',on:false});});
  await page.waitForFunction(()=>window.__snagTv.ready&&document.fonts.check('27px Rubik'));
  scenes.add('lobby');await page.screenshot({path:out+'/lobby.png'});
  await page.evaluate(()=>window.__snagTv.command({command:'bots',start:true}));
  const start=Date.now();let key='',completed=false;
  while(Date.now()-start<480000) {
    const v=await page.evaluate(()=>{const s=window.__snagTv,v=s.getView();return {scene:v.scene,phase:v.phase,round:v.round,completed:v.completed,exceptions:s.exceptions};});
    scenes.add(v.scene);
    const next=v.round+':'+v.scene+':'+v.phase;
    if(next!==key){key=next;phases.push({...v,elapsedMs:Date.now()-start});console.log(key);}
    if(v.completed){completed=true;break;}
    await new Promise(r=>setTimeout(r,200));
  }
  await new Promise(r=>setTimeout(r,2500));
  await page.screenshot({path:out+'/finale.png'});
  const receipt={webIterationOnly:true,speed:1,audio:'muted',fixture:'all synthetic bots; no player photos',completed,elapsedMs:Date.now()-start,scenes:[...scenes],phases,errors};
  await writeFile(out+'/receipt.json',JSON.stringify(receipt,null,2)+'\n');
  if(!completed||scenes.size!==8||errors.length||phases.some(p=>p.exceptions))throw new Error('Normal-speed browser pass failed; see live/receipt.json');
  console.log('Completed all 8 scenes at normal speed, no browser exceptions.');
} finally {await browser.close();}
