/** Runs inside Chromium. Measures rendered text, including outlined SVG glyphs. */
export function inspectClarity() {
  const root = document.querySelector('[data-testid="clarity-scene"]');
  if (!root) throw new Error('Scene review root missing');
  const round = n => Math.round(n * 100) / 100;
  const rect = r => ({ x: round(r.left), y: round(r.top), w: round(r.width), h: round(r.height) });
  const visible = el => {
    let opacity = 1;
    for (let p = el; p instanceof Element; p = p.parentElement) {
      const s = getComputedStyle(p);
      opacity *= Number(s.opacity);
      if (s.display === 'none' || s.visibility === 'hidden' || opacity < .025) return false;
      if(p!==el && (s.overflowX==='hidden'||s.overflowY==='hidden')) {const a=el.getBoundingClientRect(),b=p.getBoundingClientRect();if(a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom)return false;}
    }
    return true;
  };
  const union = rs => ({ x: Math.min(...rs.map(r => r.x)), y: Math.min(...rs.map(r => r.y)), w: Math.max(...rs.map(r => r.x+r.w))-Math.min(...rs.map(r => r.x)), h: Math.max(...rs.map(r => r.y+r.h))-Math.min(...rs.map(r => r.y)) });
  const target = el => { for (let p=el; p && p!==root; p=p.parentElement) { const t=p.getAttribute('data-testid'); if(t && !t.startsWith('clarity-')) return t; } return ''; };
  const group = el => {
    const t=target(el), scene=window.__snagTv.getView().scene;
    if(scene==='lobby') return /lobby.(snag|ampersand|brag)$/.test(t)?'wordmark':t;
    if(scene==='intro') return t.startsWith('intro.reel')?'reel':t||'countdown instruction';
    if(scene==='hunt') return el.getBoundingClientRect().top>=490 || /slot|ready:|snag-|first-snag/.test(t)?'feed board': t==='hunt.time'?'time callout':el.getBoundingClientRect().left>1240?'clock':'prompt';
    if(scene==='judge') return /judge-card|judge-bar|judge-swatch|judge.crown/.test(t)?'judge board':'judge instruction';
    if(scene==='stand') return t.startsWith('lane')||t.startsWith('overtake')?'score board':t||'next round';
    if(scene==='brag') return /fighter-left|line-left/.test(t)?'left fighter':/fighter-right|line-right/.test(t)?'right fighter':/ko|tug/.test(t)?'result':'match instruction';
    if(scene==='show') return /pedestal|show-find|vote-badge/.test(t)?'runway board':'vote / winner instruction';
    if(scene==='champ') return t==='champ.object'?'object of the night':/podium|champ.fourth/.test(t)?'podium board':/champ.name/.test(t)||el.getBoundingClientRect().top<490?'champion':'play again';
    return t;
  };
  const labels = [...root.querySelectorAll('[data-testid^="clarity-type:"], svg[aria-label]')].filter(visible);
  const candidates = [...labels, ...root.querySelectorAll('[dir="auto"], input')].filter(el => visible(el) && !el.closest('svg') && !labels.some(p => p!==el && p.contains(el)) && !(el.hasAttribute('dir') && el.parentElement.closest('[dir="auto"]')));
  // SVG text is an atomic label; its paths provide ink bounds, not an oversized layout box.
  for(const el of labels) if(!candidates.includes(el)) candidates.push(el);
  const text=[], issues=[];
  for(const el of candidates) {
    const value=(el.getAttribute('aria-label') ?? el.value ?? el.textContent ?? '').trim();
    if(!value) continue;
    const box=rect(el.getBoundingClientRect()), style=getComputedStyle(el);
    let rs=[];
    if(el.querySelector('svg') || el.tagName.toLowerCase()==='svg') {
      const paths=[...el.querySelectorAll('path')].filter(p=>p.getAttribute('d') && visible(p));
      rs=paths.map(p=>rect(p.getBoundingClientRect())).filter(r=>r.w&&r.h);
      if(rs.length) rs=[union(rs)];
    } else if(el.tagName==='INPUT') {
      const canvas=document.createElement('canvas'),c=canvas.getContext('2d'); c.font=style.font;
      const m=c.measureText(value), scale=box.w/el.clientWidth, width=m.width*scale;
      const baseline=box.y+(box.h-(m.fontBoundingBoxAscent+m.fontBoundingBoxDescent)*scale)/2+m.fontBoundingBoxAscent*scale;
      rs=[{x:box.x+box.w-width,y:baseline-m.actualBoundingBoxAscent*scale,w:width,h:(m.actualBoundingBoxAscent+m.actualBoundingBoxDescent)*scale}];
      if(width>box.w+1) issues.push({kind:'overflow',text:value,reason:'input ink exceeds width',box,ink:rs[0]});
    } else {
      const range=document.createRange();range.selectNodeContents(el);
      rs=[...range.getClientRects()].map(rect).filter(r=>r.w>.5&&r.h>.5);
      // A rich text parent reports nested spans too; remove contained duplicate rectangles.
      rs=rs.filter((r,i)=>!rs.some((b,j)=>j!==i && b.x<=r.x && b.y<=r.y && b.x+b.w>=r.x+r.w && b.y+b.h>=r.y+r.h && (j<i||b.w>r.w)));
    }
    if(!rs.length) continue;
    const ink=union(rs), badge=el.closest('[aria-label^="Team badge "]');
    const size=Number(el.getAttribute('data-testid')?.split(':')[1]) || parseFloat(style.fontSize);
    const item={text:value,target:target(el),group:group(el),size,box,ink,rects:rs,badge:badge?.getAttribute('aria-label')};
    text.push(item);
    if(el.clientWidth && (el.scrollWidth>el.clientWidth+1 || el.scrollHeight>el.clientHeight+1)) issues.push({kind:'overflow',text:value,reason:'scroll dimensions exceed client',scroll:[el.scrollWidth,el.scrollHeight],client:[el.clientWidth,el.clientHeight],box});
    for(let p=el.parentElement;p&&p!==root;p=p.parentElement) {
      const s=getComputedStyle(p),b=rect(p.getBoundingClientRect());
      if((s.overflowX==='hidden'||s.overflowY==='hidden') && (ink.x<b.x-2||ink.y<b.y-2||ink.x+ink.w>b.x+b.w+2||ink.y+ink.h>b.y+b.h+2)) {issues.push({kind:'clipping',text:value,box:b,ink});break;}
    }
    if(!badge && (ink.x<63||ink.y<63||ink.x+ink.w>1857||ink.y+ink.h>1017)) issues.push({kind:'title-safe',text:value,ink});
  }
  const intersect=(a,b)=>Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>1 && Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>1;
  const gap=(a,b)=>Math.hypot(Math.max(0,a.x-b.x-b.w,b.x-a.x-a.w),Math.max(0,a.y-b.y-b.h,b.y-a.y-a.h));
  for(let i=0;i<text.length;i++) for(let j=i+1;j<text.length;j++) {
    const a=text[i],b=text[j];
    if(a.rects.some(x=>b.rects.some(y=>intersect(x,y)))) issues.push({kind:'text-overlap',a:a.text,b:b.text,aBox:a.ink,bBox:b.ink});
    else {const distance=Math.min(...a.rects.flatMap(x=>b.rects.map(y=>gap(x,y)))); if(distance<23) issues.push({kind:'text-gap',a:a.text,b:b.text,gap:round(distance),aBox:a.ink,bBox:b.ink});}
  }
  const obstacles=[...root.querySelectorAll('[aria-label^="Team badge "], [aria-label="Winner crown"]'),document.querySelector('[data-testid="host"]')].filter(Boolean).filter(visible);
  for(const el of obstacles) {
    const b=rect(el.getBoundingClientRect());
    for(const t of text) {
      if(t.badge===el.getAttribute('aria-label') && t.ink.x>=b.x-1&&t.ink.x+t.ink.w<=b.x+b.w+1&&t.ink.y>=b.y-1&&t.ink.y+t.ink.h<=b.y+b.h+1) continue;
      if(t.rects.some(r=>intersect(r,b))) issues.push({kind:'avatar/crown-overlap',text:t.text,obstacle:el.getAttribute('aria-label')??'host avatar',ink:t.ink,box:b});
    }
  }
  // Host speech remains authoritative, and is also a scene obstacle.
  const host=[...document.querySelectorAll('[dir="auto"]')].find(el=>!root.contains(el)&&getComputedStyle(el).fontSize==='27px'&&visible(el));
  if(host) {
    const range=document.createRange();range.selectNodeContents(host);const rs=[...range.getClientRects()].map(rect);
    for(const t of text) if(t.rects.some(r=>rs.some(b=>intersect(r,b)))) issues.push({kind:'host-overlap',text:t.text,ink:t.ink});
  }
  // HUD and host are outside the scene's four-block/type quota, but remain collision obstacles.
  const chrome=[...document.querySelectorAll('[dir="auto"], svg[aria-label], [data-testid^="clarity-type:"]')].filter(el=>!root.contains(el)&&visible(el)&&el.getBoundingClientRect().bottom<150);
  for(const el of chrome) {
    if(el.hasAttribute('dir')&&el.parentElement.closest('[dir="auto"]'))continue;
    let rs=[];
    if(el.querySelector('svg')||el.tagName.toLowerCase()==='svg')rs=[...el.querySelectorAll('path')].filter(p=>p.getAttribute('d')).map(p=>rect(p.getBoundingClientRect()));
    else {const r=document.createRange();r.selectNodeContents(el);rs=[...r.getClientRects()].map(rect);}
    for(const t of text) if(t.rects.some(r=>rs.some(b=>intersect(r,b)))) issues.push({kind:'hud-overlap',text:t.text,ink:t.ink});
  }
  const blocks=[...new Set(text.filter(t=>!t.badge).map(t=>t.group))];
  const heroes=[...new Set(text.filter(t=>!t.badge&&t.size>=80).map(t=>t.group))];
  const primaries=[...new Set(text.filter(t=>!t.badge&&t.text!=='?'&&t.size>=43&&t.size<=64).map(t=>t.group))];
  if(blocks.length>4) issues.push({kind:'text-block-limit',blocks});
  if(heroes.length!==1) issues.push({kind:'hero-count',heroes});
  if(primaries.length<1||primaries.length>2) issues.push({kind:'primary-count',primaries});
  for(const t of text) if(!t.badge && (t.size<19||t.size>32&&t.size<43||t.size>64&&t.size<80)) issues.push({kind:'type-tier',text:t.text,size:t.size});
  return {texts:text.length,blocks,heroes,primaries,issues,text};
}
