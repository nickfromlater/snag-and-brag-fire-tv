import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const browser = await puppeteer.launch({executablePath:process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--mute-audio','--force-color-profile=srgb']});
const errors:string[]=[];
const scenes:string[]=[];
try{
  const page=await browser.newPage();
  await page.setViewport({width:1800,height:1100,deviceScaleFactor:1});
  await page.setRequestInterception(true);
  page.on('request',r=>/^(file:|data:|blob:|about:)/.test(r.url())?void r.continue():void r.abort());
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(pathToFileURL(join(root,'reference/mockup/snag-and-brag.html')).href);
  await page.evaluate(async()=>{await document.fonts.ready;});
  const raw=await readFile(join(root,'reference/src/art.js'),'utf8');
  const identical=await page.evaluate(raw=>Array.from(document.scripts).some(s=>s.textContent?.includes(raw.trim())),raw);
  if(!identical) throw new Error('The bundled mockup does not contain the original art.js');
  await page.click('#b-join');
  await page.waitForSelector('#b-start',{visible:true,timeout:20000});
  await page.waitForFunction(()=>!(document.getElementById('b-start') as HTMLButtonElement).disabled,{timeout:20000});
  const start=await page.$('#b-start');
  if(!start)throw new Error('Missing hold button');
  const rect=await start.boundingBox();
  if(!rect)throw new Error('Hold button is hidden');
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);
  await page.mouse.down();
  await new Promise(r=>setTimeout(r,950));
  await page.mouse.up();
  const deadline=Date.now()+120000;
  let finished=false;
  while(Date.now()<deadline){
    const state=await page.evaluate(()=>{
      const current=document.querySelector('.scn.on')?.id ?? '';
      const error=document.getElementById('err');
      if(error && error.getAttribute('style')?.includes('block'))throw new Error(error.textContent ?? 'Mockup error');
      (document.getElementById('b-skip') as HTMLButtonElement).click();
      return {scene:current,final:current==='sc-champ' && !!document.getElementById('ooth')};
    });
    if(state.scene && scenes.at(-1)!==state.scene)scenes.push(state.scene);
    if(state.final){finished=true;break;}
    await new Promise(r=>setTimeout(r,120));
  }
  if(!finished)throw new Error(`Mockup failed to reach the finale: ${scenes.join(', ')}`);
  await new Promise(r=>setTimeout(r,1800));
  const tv=await page.$('#tvbox');
  if(!tv)throw new Error('Missing TV');
  await mkdir(join(root,'docs/review'),{recursive:true});
  await tv.screenshot({path:join(root,'docs/review/reference-finale.png')});
  const result={artMatchesBundledMockup:identical,scenes,errors,chrome:await browser.version(),audio:'muted',network:'offline',interaction:'Join; hold start for 950 ms; built-in Skip through all three rounds; synthetic bot objects only'};
  await writeFile(join(root,'docs/review/reference-check.json'),JSON.stringify(result,null,2)+'\n');
  if(errors.length)throw new Error(errors.join('\n'));
  console.log(JSON.stringify(result));
}finally{await browser.close();}
