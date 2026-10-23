import { expect, test } from 'vitest';
import puppeteer from 'puppeteer-core';
import { readFile } from 'node:fs/promises';
import { paradePose } from '../src/stage/parade-pose';

test('native parade follows the actual reference CSS, including alternate hops and bottom origin', async () => {
  const css=await readFile('../reference/src/style.css','utf8');
  const rules=['.pz','.ph2','@keyframes walk','@keyframes hop'].map(selector=>{
    const at=css.indexOf(selector+'{');let end=at,depth=0;
    do {if(css[end]==='{')depth++;if(css[end]==='}')depth--;end++;}while(end<css.length&&(depth||end<=at+selector.length));
    return css.slice(at,end);
  }).join('\n');
  const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--mute-audio']});
  try {
    const page=await browser.newPage();
    await page.setContent('<style>'+rules+'</style>'+Array.from({length:8},(_,i)=>'<div class="pz" style="animation-delay:-'+i*2.1+'s"><div class="ph2" style="animation-delay:-'+i*.17+'s"></div></div>').join(''));
    const times=[0,.17,.419,.42,.421,.839,.84,1.83,7.91,16.799,16.8,23.7];
    for(const time of times){
      const actual=await page.evaluate(time=>{
        document.getAnimations().forEach(a=>{a.pause();a.currentTime=time*1000;});
        return Array.from(document.querySelectorAll('.pz')).map(w=>{
          const x=new DOMMatrix(getComputedStyle(w).transform),p=new DOMMatrix(getComputedStyle(w.firstElementChild!).transform);
          return {x:x.e,dx:p.e-p.c*39,y:p.f+39-p.d*39,a:p.a,b:p.b,c:p.c,d:p.d};
        });
      },time);
      actual.forEach((a,index)=>{
        const p=paradePose(time,index),r=p.rotation*Math.PI/180;
        const expected={x:p.x,dx:p.dx,y:p.y,a:Math.cos(r)*p.sx,b:Math.sin(r)*p.sx,c:-Math.sin(r)*p.sy,d:Math.cos(r)*p.sy};
        for(const key of Object.keys(expected) as (keyof typeof expected)[])expect(Math.abs(a[key]-expected[key]),`${time}s slot ${index} ${key}`).toBeLessThan(.011);
      });
    }
  } finally {await browser.close();}
},15000);
