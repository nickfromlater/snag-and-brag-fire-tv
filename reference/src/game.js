(function(){
'use strict';
/* =====================================================================
   SNAG & BRAG — engine
   state (G) -> flows (async choreography) -> TV scenes + phone screens
   ===================================================================== */
var errBox=document.getElementById('err');
function showErr(m){ if(!errBox) return; errBox.style.display='block'; errBox.textContent='Something broke: '+m; }
window.addEventListener('error',function(e){ showErr(e.message||String(e)); });
window.addEventListener('unhandledrejection',function(e){ if(e.reason&&e.reason.cancel) { e.preventDefault(); return; } showErr((e.reason&&(e.reason.message||e.reason.code))||String(e.reason)); });

/* ---------------- utils ---------------- */
var $=function(s,r){return (r||document).querySelector(s);};
var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));};
function rnd(a,b){return a+Math.random()*(b-a);}
function ri(a,b){return Math.floor(rnd(a,b+1));}
function pick(a){return a[Math.floor(Math.random()*a.length)];}
function shuffle(a){a=a.slice();for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;}return a;}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function h(html){var t=document.createElement('template');t.innerHTML=html.trim();return t.content.firstElementChild;}
var RM=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function hap(p){ if(navigator.vibrate){ try{navigator.vibrate(p);}catch(e){} } }
function fmt(s){ s=Math.max(0,Math.ceil(s)); return Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); }

/* real spring easing via CSS linear() */
function springCurve(k,c){var x=0,v=0,dt=1/240,t=0,pts=[0];while(t<3){var a=-k*(x-1)-c*v;v+=a*dt;x+=v*dt;t+=dt;pts.push(x);if(t>.25&&Math.abs(x-1)<.0015&&Math.abs(v)<.02)break;}
  var n=72,out=[];for(var i=0;i<n;i++)out.push(pts[Math.round(i*(pts.length-1)/(n-1))].toFixed(4));out[n-1]='1';return {e:'linear('+out.join(',')+')',d:Math.round(t*1000)};}
var HAS_LINEAR=window.CSS&&CSS.supports&&CSS.supports('transition-timing-function','linear(0, 1)');
var SP={};[['pop',320,15],['soft',150,18],['wobble',260,8],['drop',200,12],['snap',600,28]].forEach(function(s){SP[s[0]]=HAS_LINEAR?springCurve(s[1],s[2]):{e:'cubic-bezier(.34,1.56,.64,1)',d:600};});
document.documentElement.style.setProperty('--spring',SP.pop.e);
function A(el,frames,o){o=o||{};if(!el)return {finished:Promise.resolve()};var s=o.sp?SP[o.sp]:null;
  if(o.reset)el.getAnimations().forEach(function(a){a.cancel();});
  return el.animate(frames,{duration:o.d||(s?s.d:420),easing:o.e||(s?s.e:'cubic-bezier(.2,.7,.3,1)'),delay:o.delay||0,fill:o.fill||'both',iterations:o.it||1,composite:o.comp||'replace'});}
function done(a){return a&&a.finished?a.finished.catch(function(){}):Promise.resolve();}

/* ---------------- generations, sleeps and the Skip button ---------------- */
var GEN=0,CANCEL={cancel:true};
function sleep(ms){var g=GEN;return new Promise(function(res,rej){setTimeout(function(){g===GEN?res():rej(CANCEL);},ms);});}
var skipFn=null,skipBtn=document.getElementById('b-skip');
function setSkip(on){skipBtn.disabled=!on&&!HOST.typing;}
/* a long, skippable phase. tick(elapsed,total) may return true to end early */
function phase(ms,tick){var g=GEN;return new Promise(function(res,rej){var t0=performance.now(),fin=false,iv;
  function end(){if(fin)return;fin=true;clearInterval(iv);if(skipFn===end)skipFn=null;setSkip(false);if(g===GEN)res();else rej(CANCEL);}
  iv=setInterval(function(){if(g!==GEN){fin=true;clearInterval(iv);rej(CANCEL);return;}var el=Math.min(performance.now()-t0,ms);var stop=tick?tick(el,ms):false;if(el>=ms||stop)end();},50);
  skipFn=end;setSkip(true);});}
skipBtn.addEventListener('click',function(){ ac(); SFX.tap(); if(HOST.typing){HOST.finish();} if(skipFn){skipFn();} });

/* ---------------- colour science for the Pixel Judge ---------------- */
function hex2rgb(h){h=h.replace('#','');return [parseInt(h.substr(0,2),16),parseInt(h.substr(2,2),16),parseInt(h.substr(4,2),16)];}
function rgb2lab(r,g,b){r/=255;g/=255;b/=255;function f(c){return c>.04045?Math.pow((c+.055)/1.055,2.4):c/12.92;}r=f(r);g=f(g);b=f(b);
  var x=(r*.4124+g*.3576+b*.1805)/.95047,y=(r*.2126+g*.7152+b*.0722),z=(r*.0193+g*.1192+b*.9505)/1.08883;
  function q(t){return t>.008856?Math.cbrt(t):7.787*t+16/116;}x=q(x);y=q(y);z=q(z);return [116*y-16,500*(x-y),200*(y-z)];}
function dE(a,b){return Math.sqrt(Math.pow(a[0]-b[0],2)+Math.pow(a[1]-b[1],2)+Math.pow(a[2]-b[2],2));}
function colorMatch(hexA,hexB){var a=hex2rgb(hexA),b=hex2rgb(hexB);return clamp(Math.round(100-dE(rgb2lab(a[0],a[1],a[2]),rgb2lab(b[0],b[1],b[2]))*1.05),2,99);}

/* =====================================================================
   AUDIO — synth SFX, procedural music bed, host voice
   ===================================================================== */
var AU={ctx:null,sfx:true,mus:true};
function ac(){
  if(!AU.ctx){try{var C=window.AudioContext||window.webkitAudioContext;if(!C)return null;var c=new C();AU.ctx=c;
    AU.master=c.createGain();AU.master.gain.value=.9;var comp=c.createDynamicsCompressor();comp.threshold.value=-12;comp.ratio.value=4;AU.master.connect(comp);comp.connect(c.destination);
    AU.sb=c.createGain();AU.sb.gain.value=.8;AU.sb.connect(AU.master);
    AU.mb=c.createGain();AU.mb.gain.value=AU.mus?.22:0;AU.mb.connect(AU.master);
    AU.verb=c.createConvolver();var len=Math.floor(c.sampleRate*1.2),ir=c.createBuffer(2,len,c.sampleRate);for(var ch=0;ch<2;ch++){var d=ir.getChannelData(ch);for(var i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,3);}
    AU.verb.buffer=ir;var vg=c.createGain();vg.gain.value=.18;AU.verb.connect(vg);vg.connect(AU.master);
    var nb=c.createBuffer(1,c.sampleRate,c.sampleRate),nd=nb.getChannelData(0);for(var k=0;k<nd.length;k++)nd[k]=Math.random()*2-1;AU.noise=nb;
    MUS.start();
  }catch(e){AU.ctx=null;}}
  if(AU.ctx&&AU.ctx.state==='suspended'){try{AU.ctx.resume();}catch(e){}}
  return AU.ctx;
}
document.addEventListener('pointerdown',ac,{passive:true});
document.addEventListener('keydown',ac);
function T(d){return AU.ctx.currentTime+(d||0);}
function osc(f,d,type,vol,o){o=o||{};var c=AU.ctx;if(!c)return;if(o.bus!==AU.mb&&!AU.sfx)return;var t=o.at!=null?o.at:T(o.delay),g=c.createGain(),s=c.createOscillator();s.type=type||'sine';s.frequency.setValueAtTime(f,t);
  if(o.slide)s.frequency.exponentialRampToValueAtTime(Math.max(20,f*o.slide),t+d);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(vol||.2,t+(o.att||.006));g.gain.exponentialRampToValueAtTime(.0001,t+d);
  var out=g;if(o.lp){var fl=c.createBiquadFilter();fl.type='lowpass';fl.frequency.setValueAtTime(o.lp,t);if(o.lpEnd)fl.frequency.exponentialRampToValueAtTime(o.lpEnd,t+d);fl.Q.value=o.q||1;s.connect(fl);fl.connect(g);}else s.connect(g);
  out.connect(o.bus||AU.sb);if(o.wet)out.connect(AU.verb);s.start(t);s.stop(t+d+.05);}
function nz(d,vol,freq,o){o=o||{};var c=AU.ctx;if(!c)return;if(o.bus!==AU.mb&&!AU.sfx)return;var t=o.at!=null?o.at:T(o.delay),s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();s.buffer=AU.noise;
  f.type=o.type||'bandpass';f.frequency.setValueAtTime(freq||1000,t);if(o.fEnd)f.frequency.exponentialRampToValueAtTime(o.fEnd,t+d);f.Q.value=o.q||1;
  g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(vol||.2,t+(o.att||.004));g.gain.exponentialRampToValueAtTime(.0001,t+d);s.connect(f);f.connect(g);g.connect(o.bus||AU.sb);if(o.wet)g.connect(AU.verb);s.start(t,Math.random()*.5);s.stop(t+d+.05);}
function bell(f,v,dl){osc(f,.8,'sine',v,{delay:dl,wet:1});osc(f*2.76,.25,'sine',v*.15,{delay:dl,wet:1});osc(f*5.4,.1,'sine',v*.05,{delay:dl});}
var _sfxBoom=1;var PENTA=[523.25,587.33,659.25,783.99,880,1046.5,1174.66,1318.51,1567.98,1760,2093,2349.3,2637];
var SFX={
  tap:function(){if(!AU.ctx)return;osc(1300,.04,'sine',.07,{slide:.6});},
  sel:function(){if(!AU.ctx)return;osc(660,.08,'triangle',.11);osc(990,.12,'triangle',.08,{delay:.05});},
  pop:function(n){if(!AU.ctx)return;var f=520+(n||0)*70;osc(f,.12,'sine',.18,{slide:2});nz(.03,.08,3000);},
  join:function(){if(!AU.ctx)return;bell(784,.14);bell(988,.12,.08);bell(1175,.12,.16);bell(1568,.1,.26);},
  slam:function(){if(!AU.ctx)return;osc(90,.4,'sine',.7,{slide:.4});nz(.25,.45,900,{type:'lowpass',fEnd:120});nz(.06,.25,3200,{q:1.2});},
  thump:function(){if(!AU.ctx)return;osc(130,.22,'sine',.45,{slide:.45});nz(.06,.2,400);},
  whoosh:function(){if(!AU.ctx)return;nz(.5,.28,400,{fEnd:4200,q:.8,att:.2});},
  whoop:function(){if(!AU.ctx)return;osc(300,.35,'triangle',.12,{slide:3.2});nz(.3,.12,800,{fEnd:5000,att:.1});},
  tick:function(){if(!AU.ctx)return;osc(2200,.02,'square',.025);nz(.015,.06,5200,{q:2});},
  beep:function(n){if(!AU.ctx)return;osc(n?1320:880,n?.5:.16,'square',.07,{lp:3000});osc(n?660:440,n?.5:.16,'sine',.14);},
  horn:function(){if(!AU.ctx)return;[0,.02].forEach(function(d,i){osc(392*(i?1.5:1),.7,'sawtooth',.08,{delay:d,lp:2400,lpEnd:900});});osc(196,.7,'square',.06,{lp:1200});nz(.4,.12,1500,{fEnd:400});},
  shutter:function(){if(!AU.ctx)return;nz(.03,.4,4200,{q:.9});nz(.05,.3,1800,{delay:.06,q:.9});osc(2600,.02,'square',.04,{delay:.06});},
  snagged:function(){if(!AU.ctx)return;this.shutter();[1046.5,1318.5,1568,2093].forEach(function(f,i){bell(f,.12,.08+i*.06);});},
  rival:function(){if(!AU.ctx)return;osc(740,.09,'square',.06,{lp:2400});osc(988,.16,'square',.06,{delay:.09,lp:2400});osc(150,.2,'sine',.3,{slide:.5});},
  taken:function(){if(!AU.ctx)return;osc(180,.32,'sawtooth',.1,{lp:900});osc(170,.32,'square',.06,{lp:700,delay:.02});},
  bonk:function(){if(!AU.ctx)return;osc(240,.16,'sine',.25,{slide:.5});},
  lock:function(){if(!AU.ctx)return;osc(2350,.03,'sine',.06);osc(2350,.03,'sine',.05,{delay:.06});},
  buzzer:function(){if(!AU.ctx)return;osc(110,.9,'sawtooth',.14,{lp:900});osc(116,.9,'square',.08,{lp:700});},
  flip:function(){if(!AU.ctx)return;nz(.12,.2,1800,{fEnd:600,q:1.4});osc(500,.1,'triangle',.08,{slide:1.6});},
  scan:function(){if(!AU.ctx)return;nz(.7,.08,700,{fEnd:4200,q:3});osc(330,.7,'sine',.04,{slide:2.2,wet:1});},
  mtick:function(p){if(!AU.ctx)return;osc(700+p*900,.03,'square',.03,{lp:3500});},
  coin:function(){if(!AU.ctx)return;osc(988,.08,'square',.05);osc(1319,.3,'square',.05,{delay:.08});bell(2637,.05,.08);},
  crowd:function(d,v){if(!AU.ctx)return;d=d||1.6;v=v||.16;nz(d,v,900,{q:.5,att:.2});nz(d*.8,v*.6,2000,{q:.7,att:.15,delay:.05});for(var i=0;i<8;i++)osc(500+Math.random()*700,.16,'triangle',v*.12,{delay:Math.random()*d*.7,slide:1.15});},
  aww:function(){if(!AU.ctx)return;nz(1.1,.1,700,{fEnd:300,q:.6,att:.15});},
  fanfare:function(){if(!AU.ctx)return;[523.25,659.25,783.99,1046.5,1318.5].forEach(function(f,i){bell(f,.13,i*.09);});[523.25,659.25,783.99].forEach(function(f){osc(f,1.3,'triangle',.06,{delay:.5,wet:1});});this.crowd(2,.18);},
  sparkle:function(){if(!AU.ctx)return;[1568,2093,2637,3136,3520].forEach(function(f,i){osc(f,.25,'sine',.05,{delay:i*.05,wet:1});});},
  boing:function(){if(!AU.ctx)return;osc(180,.36,'sine',.24,{slide:3});osc(270,.28,'triangle',.06,{slide:2.4,delay:.02});},
  stamp:function(){if(!AU.ctx)return;osc(95,.26,'sine',.5,{slide:.5});nz(.09,.3,520,{q:.7});nz(.05,.16,2600,{delay:.02});},
  mash:function(n){if(!AU.ctx)return;osc(PENTA[n%13]*.5,.06,'square',.05,{lp:2200});nz(.03,.1,1400+n*30,{q:2});},
  react:function(k,n){if(!AU.ctx)return;var f=PENTA[(n||0)%10];if(k==='heart')osc(f,.1,'sine',.1,{slide:1.3});else if(k==='star')bell(f*1.5,.06);else if(k==='flame')nz(.12,.12,2400,{fEnd:600});else{osc(160,.18,'sawtooth',.06,{lp:800,slide:.7});}},
  rollTick:function(){if(!AU.ctx)return;osc(1900,.018,'square',.02);},
  reveal:function(){if(!AU.ctx)return;nz(.3,.2,1200,{fEnd:5200});[784,1046.5,1318.5,1568].forEach(function(f,i){bell(f,.1,.04+i*.05);});osc(98,.3,'sine',.35,{slide:.5});},
  drumroll:function(sec){if(!AU.ctx)return;var n=Math.floor(sec/.05);for(var i=0;i<n;i++){var p=i/n;nz(.05,.04+p*.14,1700,{delay:i*.05,q:.9});if(i%4===0)osc(100,.06,'sine',.06+p*.1,{delay:i*.05,slide:.6});}},
  riser:function(sec){if(!AU.ctx)return;nz(sec,.12,300,{fEnd:6000,att:sec*.9,q:2});osc(200,sec,'sawtooth',.03,{slide:4,att:sec*.9,lp:3000});},
  voice:function(){var c=AU.ctx;if(!c||!AU.sfx)return;var t=c.currentTime,f=210+Math.random()*90,o=c.createOscillator(),g=c.createGain(),b1=c.createBiquadFilter(),b2=c.createBiquadFilter();
    o.type='sawtooth';o.frequency.setValueAtTime(f*1.15,t);o.frequency.exponentialRampToValueAtTime(f*.88,t+.09);b1.type='bandpass';b1.frequency.value=600+Math.random()*500;b1.Q.value=6;b2.type='bandpass';b2.frequency.value=1500+Math.random()*900;b2.Q.value=8;
    g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.12,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+.1);o.connect(b1);o.connect(b2);b1.connect(g);b2.connect(g);g.connect(AU.sb);o.start(t);o.stop(t+.12);}
};

/* ---- music: a 4-bar loop, 16 steps a bar, switched by mood ---- */
SFX.boom=function(){if(!AU.ctx)return;osc(70,.5,'sine',.32,{slide:.5});nz(.5,.2,700,{type:'lowpass',fEnd:140});for(var i=0;i<6;i++)nz(.02,.07,5200,{delay:.15+i*.05+Math.random()*.03,q:2});};
SFX.ko=function(){if(!AU.ctx)return;osc(60,.8,'sine',.6,{slide:.4});nz(.6,.4,1400,{type:'lowpass',fEnd:90});[392,523.25,659.25,783.99].forEach(function(f,i){osc(f,.5,'sawtooth',.05,{delay:.08+i*.06,lp:2400});});};
var MUS={mood:'lobby',bpm:104,step:0,next:0,iv:null,
  start:function(){if(this.iv)return;var self=this;this.next=AU.ctx.currentTime+.08;this.iv=setInterval(function(){self.sched();},25);},
  set:function(m){if(this.mood===m)return;this.mood=m;this.bpm={lobby:102,hunt:124,urgent:140,tension:90,brag:116,win:122,off:100}[m]||104;},
  sched:function(){var c=AU.ctx;if(!c)return;while(this.next<c.currentTime+.12){this.play(this.step,this.next);this.next+=60/this.bpm/4;this.step=(this.step+1)%64;}},
  play:function(s,t){if(!AU.mus||this.mood==='off')return;var bar=Math.floor(s/16)%4,st=s%16,m=this.mood,B=AU.mb;
    var prog=m==='win'?[[60,64,67],[65,69,72],[67,71,74],[60,64,67]]:[[57,60,64],[53,57,60],[48,52,55],[55,59,62]];
    var root=(m==='win'?[48,41,43,48]:[45,41,36,43])[bar];
    function mf(n){return 440*Math.pow(2,(n-69)/12);}
    function kick(v){osc(150,.28,'sine',v,{at:t,slide:.3,bus:B});}
    function clap(v){nz(.1,v,1600,{at:t,q:.8,bus:B});nz(.08,v*.6,1100,{at:t+.012,q:.8,bus:B});}
    function hat(v,o){nz(o?.14:.035,v,8000,{at:t,type:'highpass',bus:B});}
    function bass(n,d,v){osc(mf(n),d,'sawtooth',v,{at:t,lp:900,lpEnd:220,bus:B});osc(mf(n-12),d,'sine',v*.9,{at:t,bus:B});}
    function stab(v,d){prog[bar].forEach(function(n){osc(mf(n+12),d||.12,'square',v,{at:t,lp:2600,lpEnd:700,bus:B});});}
    function pad(v){prog[bar].forEach(function(n){osc(mf(n),2.4,'triangle',v,{at:t,att:.5,bus:B});});}
    if(m==='lobby'){ if(st===0||st===10)kick(.5); if(st===4||st===12)clap(.12); if(st%2===0)hat(.03,st%4===2);
      if(st===0)bass(root,.3,.12); if(st===6)bass(root+12,.15,.08); if(st===8)bass(root,.2,.1); if(st===14)bass(root+7,.15,.08); if(st===3||st===11)stab(.025,.1); }
    else if(m==='hunt'||m==='urgent'){ if(st%4===0)kick(.62); if(st===4||st===12)clap(.16); hat(st%2?.03:.018,st%4===2);
      if(st%2===0)bass(st%4===0?root:root+12,.12,.11); if(st===3||st===6||st===11)stab(.03,.09);
      if(m==='urgent'){ if(st%2===1)hat(.025); if(st===0&&bar%2===0)osc(mf(root+24),.5,'square',.025,{at:t,lp:2000,slide:1.5,bus:B}); } }
    else if(m==='tension'){ if(st===0||st===3)kick(st?.32:.5); if(st%4===0)hat(.03); if(st===0)pad(.035); if(st===0||st===8)bass(root,.5,.07); if(st===14)osc(mf(root+31),.1,'sine',.03,{at:t,bus:B}); }
    else if(m==='brag'){ if(st===0||st===7||st===8)kick(.55); if(st===4||st===12)clap(.15); if(st%2)hat(.03,st===15);
      [[0,0],[3,12],[6,0],[10,10],[12,7]].forEach(function(q){if(st===q[0])bass(root+q[1],.14,.11);}); if(st===2||st===9)stab(.03,.1); }
    else if(m==='win'){ if(st%4===0)kick(.6); if(st===4||st===12)clap(.16); hat(.025,st%4===2); if(st%2===0)bass(st%4===0?root:root+12,.14,.11);
      if(st===0)stab(.04,.4); if(st===6||st===10)stab(.03,.1); }
  }
};

/* =====================================================================
   DEFS: sticker symbols + die-cut filter
   ===================================================================== */
(function(){var d='';
  d+='<filter id="diecut" x="-30%" y="-30%" width="160%" height="170%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceAlpha" stdDeviation="3.2" result="b1"/><feComponentTransfer in="b1" result="wa"><feFuncA type="linear" slope="14" intercept="-0.6"/></feComponentTransfer><feGaussianBlur in="SourceAlpha" stdDeviation="4.6" result="b2"/><feComponentTransfer in="b2" result="ka"><feFuncA type="linear" slope="14" intercept="-0.25"/></feComponentTransfer><feFlood flood-color="#0E0B2B"/><feComposite in2="ka" operator="in" result="ink"/><feFlood flood-color="#0E0B2B" flood-opacity=".42"/><feComposite in2="ka" operator="in"/><feOffset dy="6" result="sh"/><feFlood flood-color="#FFF8EC"/><feComposite in2="wa" operator="in" result="wh"/><feMerge><feMergeNode in="sh"/><feMergeNode in="ink"/><feMergeNode in="wh"/><feMergeNode in="SourceGraphic"/></feMerge></filter>';
  Object.keys(ART).forEach(function(k){d+='<symbol id="o-'+k+'" viewBox="0 0 120 120" overflow="visible">'+ART[k]+'</symbol>';});
  d+='<symbol id="i-star" viewBox="0 0 24 24"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.3 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" fill="#FFD43B" stroke="#0E0B2B" stroke-width="2" stroke-linejoin="round"/></symbol>';
  d+='<symbol id="i-heart" viewBox="0 0 24 24"><path d="M12 21C6 16.6 2.5 13 2.5 8.8 2.5 6 4.7 3.8 7.4 3.8c1.9 0 3.6 1 4.6 2.6 1-1.6 2.7-2.6 4.6-2.6 2.7 0 4.9 2.2 4.9 5 0 4.2-3.5 7.8-9.5 12.2z" fill="#FF4FA0" stroke="#0E0B2B" stroke-width="2" stroke-linejoin="round"/></symbol>';
  d+='<symbol id="i-flame" viewBox="0 0 24 24"><path d="M12 22c-4.4 0-7.5-3-7.5-7.2 0-3.6 2.4-5.6 3.9-8 .3 2 1.4 3.2 2.6 3.6C10.6 6.7 12.4 3.6 15 2c-.4 3 1.2 5 2.7 7 1.1 1.5 1.8 3.2 1.8 5.4C19.5 19 16.4 22 12 22z" fill="#FF7A1F" stroke="#0E0B2B" stroke-width="2" stroke-linejoin="round"/><path d="M12 20c-2 0-3.3-1.4-3.3-3.2 0-1.8 1.4-2.8 2.2-4 .5 1.3 1.6 1.8 2.4 1.6.9 1.2 2 2.2 2 3.4C15.3 18.6 14 20 12 20z" fill="#FFD43B"/></symbol>';
  d+='<symbol id="i-tomato" viewBox="0 0 24 24"><circle cx="12" cy="13.5" r="8.5" fill="#F23B2E" stroke="#0E0B2B" stroke-width="2"/><path d="M12 6.5L9 3.5M12 6.5l3-3M12 6.5L7.5 7.5M12 6.5l4.5 1" stroke="#3BB54A" stroke-width="2.4" stroke-linecap="round"/><ellipse cx="8.5" cy="11" rx="2" ry="1.2" fill="#fff" opacity=".6" transform="rotate(-30 8.5 11)"/></symbol>';
  document.getElementById('gdefs').innerHTML=d;})();

/* =====================================================================
   DATA
   ===================================================================== */
var BOTS=[{id:'cp',name:'Couch Potatoes',mono:'CP',color:'#FF7A1F'},{id:'jd',name:'Junk Drawer Gang',mono:'JD',color:'#B8F23B'},{id:'gr',name:"Grandma's Revenge",mono:'GR',color:'#3FE0D0'}];
var YOU_COLORS=['#FF4FA0','#8B5CFF','#FFD43B','#F23B2E'];
var DARK={'#8B5CFF':1,'#F23B2E':1};
var TEAM_NAMES=['Sock Goblins','The Snaggletooths','Couch Commandos','Fridge Raiders','Lost Remote Club','Team Doohickey','The Junk Monks','Crumb Bums','The Dust Bunnies','Captain Clutter','Pillow Fort Inc','The Thingamajigs','Basement Bandits','Chaos Gremlins'];
var COLORS=[{k:'RED',hex:'#F23B2E'},{k:'BLUE',hex:'#2E5BFF'},{k:'YELLOW',hex:'#FFD43B'},{k:'GREEN',hex:'#3BB54A'},{k:'PINK',hex:'#FF6FB5'},{k:'ORANGE',hex:'#FF7A1F'}];
var BRAGP=[{t:'loot',a:'Something a',b:'PIRATE',c:'would steal',col:'#FFD43B',ic:'crown'},{t:'old',a:'Something that has',b:'SEEN THINGS',c:'(the older the better)',col:'#3FE0D0',ic:'portrait'},
  {t:'tough',a:'Something that would',b:'WIN A FIGHT',c:'against anything',col:'#FF7A1F',ic:'pan'},{t:'isle',a:'Your',b:'ISLAND BUDDY',c:'for a desert island',col:'#B8F23B',ic:'teddy'}];
var SHOWP=[{t:'weird',a:'The',b:'WEIRDEST',c:'thing you can find',col:'#FF4FA0',ic:'sock'},{t:'museum',a:'Something that belongs',b:'IN A MUSEUM',c:'priceless, obviously',col:'#FFD43B',ic:'record'}];
var ROUNDS=[{kind:'color',name:'COLOR RUSH',nice:'Color Rush',k:'ROUND 1 OF 3',sub:'The Pixel Judge scores the closest color. Fastest snag earns a bonus.'},
  {kind:'brag',name:'BRAG-OFF',nice:'Brag-Off',k:'ROUND 2 OF 3',sub:'Head to head. Everyone mashes their phone to swing the vote.'},
  {kind:'show',name:'SHOWSTOPPER',nice:'Showstopper',k:'FINAL ROUND',sub:'Double points. Everyone votes. The best find goes holographic.'}];
var GEN_NAMES=['Exhibit A','The Thingamajig','Lil Doohickey','Sir Whatsit','The Gizmo','Captain Unknown','Mystery Guest','Big Deal','The Contraption','Lady Knickknack'];
var PRE=['Sir','Dame','Captain','Lil','Big','Professor','Lady','Duke','Agent','Coach','Auntie','DJ'];
var GEN_BRAGS=['Found it in under 30 seconds. Legend.','Nobody asked for this. Everybody needed it.','Has more personality than the fridge.','Ten out of ten. No notes.','Born for this exact moment.','Was here before you moved in.'];
var TICKS=['LOCAL REMOTE FOUND INSIDE FRIDGE, REFUSES TO EXPLAIN','DRYER DENIES ALL KNOWLEDGE OF MISSING SOCK','BANANA ENTERS FINAL STAGE OF RIPENESS','CAT KNOCKS PRIZE MUG OFF TABLE, SHOWS NO REMORSE','JUNK DRAWER ANNEXES SECOND DRAWER','TEDDY BEAR CELEBRATES 30 YEARS OF HUGS','LAVA LAMP STILL BUBBLING, SCIENTISTS BAFFLED','GRANDPA PORTRAIT SPOTTED JUDGING DINNER GUESTS'];

/* =====================================================================
   STATE
   ===================================================================== */
var G;
function freshState(keepYou){
  var you=keepYou&&G?G.teams[0]:null;
  G={teams:[],r:-1,taken:{},finds:[],cur:null,you:null,sent:false,all:[],aiq:{}};
  var y=you?{id:'you',name:you.name,mono:you.mono,color:you.color,you:true,score:0,joined:false}:{id:'you',name:'',mono:'ME',color:YOU_COLORS[0],you:true,score:0,joined:false};
  G.teams.push(y);BOTS.forEach(function(b){G.teams.push({id:b.id,name:b.name,mono:b.mono,color:b.color,you:false,score:0,joined:false});});
  G.you=y;
}
function team(id){for(var i=0;i<G.teams.length;i++)if(G.teams[i].id===id)return G.teams[i];return null;}
function monoOf(n){var w=n.replace(/[^A-Za-z0-9 ]/g,'').trim().split(/\s+/).filter(function(x){return x&&!/^(the|of|and|a)$/i.test(x);});if(!w.length)return 'ME';return (w.length>1?w[0][0]+w[1][0]:w[0].substr(0,2)).toUpperCase();}
function badge(t,cls){return '<span class="badge'+(DARK[t.color]?' lt':'')+(cls?' '+cls:'')+'" style="--c:'+t.color+'">'+esc(t.mono)+'</span>';}

/* =====================================================================
   STICKERS + GOOGLY EYES
   ===================================================================== */
var _uid=0;
function stickerSVG(f){
  if(f.photo){var id='ph'+(++_uid);return '<svg viewBox="0 0 120 120" aria-hidden="true"><defs><clipPath id="'+id+'"><rect x="10" y="10" width="100" height="100" rx="20"/></clipPath></defs><g filter="url(#diecut)"><image href="'+f.photo+'" x="10" y="10" width="100" height="100" preserveAspectRatio="xMidYMid slice" clip-path="url(#'+id+')"/></g></svg>';}
  return '<svg viewBox="0 0 120 120" aria-hidden="true"><use href="#o-'+f.obj+'" filter="url(#diecut)"/></svg>';
}
function sticker(f,opts){opts=opts||{};var el=h('<div class="stk">'+stickerSVG(f)+'</div>');var e=opts.eyes===false?null:(f.eyes||null);if(e)addEyes(el,e);return el;}
var EYES=[];
function addEyes(host,e){var r=e[2]||8;[e[0],e[1]].forEach(function(p){if(!p)return;var g=document.createElement('div');g.className='gg';var sz=r*2/120*100;
  g.style.cssText='width:'+sz+'%;height:'+sz+'%;left:'+(p[0]/120*100-sz/2)+'%;top:'+(p[1]/120*100-sz/2)+'%';g.innerHTML='<i></i>';host.appendChild(g);
  EYES.push({host:host,el:g,p:g.firstChild,x:rnd(-.3,.3),y:.6,vx:rnd(-4,4),vy:rnd(-6,0),lx:null,ly:null});});}
function kickEyes(host,pw){EYES.forEach(function(e){if(!host||host.contains(e.el)){e.vx+=rnd(-1,1)*pw;e.vy+=rnd(-1,.3)*pw;}});}
var _rc=new Map();
function stepEyes(dt){_rc.clear();
  for(var i=EYES.length-1;i>=0;i--){var e=EYES[i];if(!e.el.isConnected){EYES.splice(i,1);continue;}
    var r=_rc.get(e.host);if(!r){var b=e.host.getBoundingClientRect();r={x:b.left+b.width/2,y:b.top+b.height/2,w:Math.max(20,b.width)};_rc.set(e.host,r);}
    if(r.w<2)continue;
    if(e.lx!=null){var k=7/r.w;e.vx-=clamp((r.x-e.lx)*k/dt*.06,-18,18);e.vy-=clamp((r.y-e.ly)*k/dt*.06,-18,18);}
    e.lx=r.x;e.ly=r.y;
    e.vx+=(-14*e.x-1.4*e.vx)*dt;e.vy+=(-14*(e.y-.45)-1.4*e.vy+2)*dt;e.x+=e.vx*dt;e.y+=e.vy*dt;
    var d=Math.sqrt(e.x*e.x+e.y*e.y);if(d>1){e.x/=d;e.y/=d;var dot=(e.vx*e.x+e.vy*e.y);e.vx-=1.6*dot*e.x;e.vy-=1.6*dot*e.y;}
    e.p.style.transform='translate('+(e.x*42).toFixed(1)+'%,'+(e.y*42).toFixed(1)+'%)';}
}

/* =====================================================================
   TV: scaling, background, particles, camera moves
   ===================================================================== */
var tv=$('#tv'),tvbox=$('#tvbox'),tvin=$('#tvin'),world=$('#world');
function fitTV(){var s=tvbox.clientWidth/1280;tv.style.setProperty('--s',s);}
window.addEventListener('resize',fitTV);if(window.ResizeObserver)new ResizeObserver(fitTV).observe(tvbox);fitTV();

var BG={c:$('#tvbg').getContext('2d'),t:0,mood:'normal',cur:null,tgt:null,doodles:[],hal:null};
BG.pal={normal:{base:[43,59,255],ray:[58,76,255],glow:[110,124,255]},urgent:{base:[232,40,104],ray:[255,72,132],glow:[255,140,180]},tension:{base:[26,32,150],ray:[36,46,178],glow:[80,90,220]},party:{base:[139,92,255],ray:[160,120,255],glow:[255,150,220]},gold:{base:[240,150,20],ray:[255,184,40],glow:[255,230,140]}};
BG.cur=JSON.parse(JSON.stringify(BG.pal.normal));BG.tgt=BG.pal.normal;
BG.set=function(m){BG.mood=m;BG.tgt=BG.pal[m]||BG.pal.normal;};
(function(){var o=document.createElement('canvas');o.width=1280;o.height=720;var x=o.getContext('2d');x.fillStyle='rgba(14,11,43,1)';
  for(var y=0;y<720;y+=14)for(var X=(y/14%2)*7;X<1280;X+=14){var dx=(X-640)/640,dy=(y-360)/360,d=Math.sqrt(dx*dx*.9+dy*dy*1.1);var r=clamp((d-.55)*4.2,0,3.4);if(r>.3){x.beginPath();x.arc(X,y,r,0,7);x.fill();}}
  BG.hal=o;
  var kinds=['star','ring','squig','plus','dot'];for(var i=0;i<16;i++)BG.doodles.push({k:kinds[i%5],x:rnd(0,1280),y:rnd(0,720),s:rnd(14,34),r:rnd(0,6.28),vr:rnd(-.4,.4),vy:rnd(-10,-4),c:pick(['#FFD43B','#FF4FA0','#3FE0D0','#B8F23B','#FFF8EC'])});})();
function lerpA(a,b,t){for(var i=0;i<3;i++)a[i]+=(b[i]-a[i])*t;}
function rgb(a,al){return 'rgba('+(a[0]|0)+','+(a[1]|0)+','+(a[2]|0)+','+(al==null?1:al)+')';}
function starPath(x,cx,cy,R,r,n){x.beginPath();for(var i=0;i<n*2;i++){var a=i*Math.PI/n-Math.PI/2,rr=i%2?r:R;x.lineTo(cx+Math.cos(a)*rr,cy+Math.sin(a)*rr);}x.closePath();}
function mixc(a,b,t){return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];}
var HZ=496,INK3=[10,8,40];
BG.spot={normal:.55,urgent:.85,tension:.8,party:1,gold:1.2};
BG.ang=0;BG.draw=function(dt){var x=BG.c;BG.t+=dt;var k=Math.min(1,dt*2.5);lerpA(BG.cur.base,BG.tgt.base,k);lerpA(BG.cur.ray,BG.tgt.ray,k);lerpA(BG.cur.glow,BG.tgt.glow,k);
  x.fillStyle=rgb(BG.cur.base);x.fillRect(0,0,1280,720);
  var sp=BG.mood==='urgent'?.22:(BG.mood==='party'||BG.mood==='gold')?.12:.035;BG.ang+=dt*sp;x.save();x.translate(640,HZ-70);x.rotate(BG.ang);x.fillStyle=rgb(BG.cur.ray);
  for(var i=0;i<18;i++){x.beginPath();x.moveTo(0,0);var a=i*Math.PI*2/18;x.arc(0,0,1500,a,a+Math.PI/18);x.closePath();x.fill();}x.restore();
  var g=x.createRadialGradient(640,HZ-70,40,640,HZ-70,700);g.addColorStop(0,rgb(BG.cur.glow,.6));g.addColorStop(.55,rgb(BG.cur.glow,0));x.fillStyle=g;x.fillRect(0,0,1280,HZ);
  x.lineWidth=4;x.strokeStyle='rgba(14,11,43,.35)';x.lineJoin='round';x.lineCap='round';
  BG.doodles.forEach(function(d){d.y+=d.vy*dt;d.r+=d.vr*dt;if(d.y<-50){d.y=HZ+40;d.x=rnd(0,1280);}if(d.y>HZ+40)return;x.save();x.translate(d.x,d.y);x.rotate(d.r);x.globalAlpha=.55;x.fillStyle=d.c;
    if(d.k==='star'){starPath(x,0,0,d.s,d.s*.45,5);x.fill();x.stroke();}else if(d.k==='ring'){x.beginPath();x.arc(0,0,d.s*.6,0,7);x.strokeStyle=d.c;x.lineWidth=6;x.stroke();x.strokeStyle='rgba(14,11,43,.35)';x.lineWidth=4;}
    else if(d.k==='squig'){x.beginPath();x.moveTo(-d.s,0);x.bezierCurveTo(-d.s/2,-d.s*.6,0,d.s*.6,d.s/2,0);x.bezierCurveTo(d.s*.7,-.3*d.s,d.s,-.2*d.s,d.s,0);x.strokeStyle=d.c;x.lineWidth=6;x.stroke();x.strokeStyle='rgba(14,11,43,.35)';x.lineWidth=4;}
    else if(d.k==='plus'){x.fillRect(-d.s*.15,-d.s*.6,d.s*.3,d.s*1.2);x.fillRect(-d.s*.6,-d.s*.15,d.s*1.2,d.s*.3);}else{x.beginPath();x.arc(0,0,d.s*.3,0,7);x.fill();}
    x.restore();});x.globalAlpha=1;
  /* the stage floor: a glossy deck with a perspective grid that drifts toward the viewer */
  var fl=x.createLinearGradient(0,HZ,0,720);fl.addColorStop(0,rgb(mixc(BG.cur.base,INK3,.42)));fl.addColorStop(1,rgb(mixc(BG.cur.base,INK3,.8)));x.fillStyle=fl;x.fillRect(0,HZ,1280,720-HZ);
  var sh=x.createRadialGradient(640,HZ,10,640,HZ,660);sh.addColorStop(0,rgb(BG.cur.glow,.42));sh.addColorStop(1,rgb(BG.cur.glow,0));x.fillStyle=sh;x.fillRect(0,HZ,1280,720-HZ);
  var vy=HZ-300,kk=(HZ-vy)/(720-vy);x.lineWidth=2;x.strokeStyle=rgb(BG.cur.glow,.2);x.beginPath();for(var q=-16;q<=16;q++){var bx=640+q*120;x.moveTo(640+(bx-640)*kk,HZ);x.lineTo(bx,720);}x.stroke();
  var fr=(BG.t*.35)%1;for(var j=0;j<9;j++){var u=(j+fr)/9,yy=HZ+(720-HZ)*u*u;x.strokeStyle=rgb(BG.cur.glow,.04+u*.22);x.beginPath();x.moveTo(0,yy);x.lineTo(1280,yy);x.stroke();}
  x.fillStyle=rgb(mixc(BG.cur.glow,[255,255,255],.45),.95);x.fillRect(0,HZ-2,1280,4);
  /* sweeping spotlights */
  var I=BG.spot[BG.mood]||.6;x.globalCompositeOperation='lighter';
  [[180,.55,0],[1100,.47,2.1],[640,.36,4.2]].forEach(function(s,ix){if(ix===2&&I<.95)return;var a=Math.sin(BG.t*s[1]+s[2])*.36,sx=s[0],sy=-70,ey=HZ+110,hx=sx+Math.tan(a)*(ey-sy),w=120;
    var gr=x.createLinearGradient(sx,sy,hx,ey);gr.addColorStop(0,'rgba(255,248,230,'+(.17*I)+')');gr.addColorStop(1,'rgba(255,248,230,0)');x.fillStyle=gr;x.beginPath();x.moveTo(sx-12,sy);x.lineTo(sx+12,sy);x.lineTo(hx+w,ey);x.lineTo(hx-w,ey);x.closePath();x.fill();
    var py=HZ+66;x.save();x.translate(hx,py);x.scale(1,.26);var pg=x.createRadialGradient(0,0,4,0,0,150);pg.addColorStop(0,'rgba(255,248,230,'+(.36*I)+')');pg.addColorStop(1,'rgba(255,248,230,0)');x.fillStyle=pg;x.beginPath();x.arc(0,0,150,0,7);x.fill();x.restore();});
  x.globalCompositeOperation='source-over';
  x.globalAlpha=.3;x.drawImage(BG.hal,0,0);x.globalAlpha=1;};

var FX={c:$('#tvfx').getContext('2d'),P:[]};
var CONF=['#FFD43B','#FF4FA0','#3FE0D0','#B8F23B','#FF7A1F','#FFF8EC','#8B5CFF'];
FX.confetti=function(x,y,n,o){o=o||{};var cols=o.cols||CONF;n=RM?Math.ceil(n/3):n;for(var i=0;i<n;i++){var a=(o.ang!=null?o.ang:-Math.PI/2)+rnd(-1,1)*(o.spread||1.2),s=rnd(.4,1)*(o.pow||900);
  FX.P.push({k:Math.random()<.2?'star':'rect',x:x,y:y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,g:o.g||1300,dr:.985,r:rnd(0,6),vr:rnd(-12,12),w:rnd(10,18),h:rnd(6,11),c:pick(cols),life:o.life||rnd(1.6,2.6),t:0});}};
FX.stars=function(x,y,n,c){for(var i=0;i<n;i++){var a=i/n*Math.PI*2+rnd(-.2,.2),s=rnd(300,600);FX.P.push({k:'star',x:x,y:y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,g:0,dr:.9,r:0,vr:rnd(-6,6),w:rnd(14,24),h:0,c:c||'#FFD43B',life:.7,t:0});}};
FX.ring=function(x,y,c,R){FX.P.push({k:'ring',x:x,y:y,R:R||180,c:c||'#FFF8EC',life:.5,t:0});};
FX.react=function(kind,x,y){FX.P.push({k:'icon',ic:kind,x:x!=null?x:rnd(260,1220),y:y!=null?y:700,vx:rnd(-30,30),vy:rnd(-260,-190),g:-40,dr:1,r:rnd(-.3,.3),vr:rnd(-1,1),w:rnd(40,60),c:'',life:2.6,t:0,ph:rnd(0,6)});};
FX.firework=function(x,y,c){var n=RM?14:46,cols=c?[c,'#FFF8EC']:[pick(CONF),pick(CONF)];for(var i=0;i<n;i++){var a=i/n*Math.PI*2+rnd(-.06,.06),s=rnd(240,430);FX.P.push({k:'spark',x:x,y:y,px:x,py:y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,g:300,dr:.955,w:rnd(3,6),c:cols[i%2],life:rnd(.9,1.4),t:0});}FX.ring(x,y,'#FFF8EC',70);FX.stars(x,y,5,cols[0]);SFX.boom();};
FX.rocket=function(x1,y1,c){var x0=x1+rnd(-120,120),T=.6,G2=500,vy=(y1-720-.5*G2*T*T)/T,vx=(x1-x0)/T;FX.P.push({k:'spark',x:x0,y:720,px:x0,py:720,vx:vx,vy:vy,g:G2,dr:1,w:4,c:'#FFF8EC',life:T,t:0});setTimeout(function(){FX.firework(x1,y1,c);},T*1000);};
FX.text=function(txt,x,y,c){FX.P.push({k:'txt',txt:txt,x:x,y:y,vx:0,vy:-120,g:0,dr:1,r:rnd(-.15,.15),vr:0,w:46,c:c||'#FFD43B',life:1.1,t:0});};
var ICP={star:new Path2D('M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.3 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z'),heart:new Path2D('M12 21C6 16.6 2.5 13 2.5 8.8 2.5 6 4.7 3.8 7.4 3.8c1.9 0 3.6 1 4.6 2.6 1-1.6 2.7-2.6 4.6-2.6 2.7 0 4.9 2.2 4.9 5 0 4.2-3.5 7.8-9.5 12.2z'),flame:new Path2D('M12 22c-4.4 0-7.5-3-7.5-7.2 0-3.6 2.4-5.6 3.9-8 .3 2 1.4 3.2 2.6 3.6C10.6 6.7 12.4 3.6 15 2c-.4 3 1.2 5 2.7 7 1.1 1.5 1.8 3.2 1.8 5.4C19.5 19 16.4 22 12 22z'),tomato:new Path2D('M3.5 13.5a8.5 8.5 0 1 0 17 0a8.5 8.5 0 1 0 -17 0z')};
var ICC={star:'#FFD43B',heart:'#FF4FA0',flame:'#FF7A1F',tomato:'#F23B2E'};
FX.draw=function(dt){var x=FX.c;x.clearRect(0,0,1280,720);
  for(var i=FX.P.length-1;i>=0;i--){var p=FX.P[i];p.t+=dt;if(p.t>p.life){FX.P.splice(i,1);continue;}var al=Math.min(1,(p.life-p.t)*3);
    if(p.k==='ring'){var q=p.t/p.life;x.beginPath();x.arc(p.x,p.y,p.R*(.2+q*.9),0,7);x.strokeStyle=p.c;x.globalAlpha=1-q;x.lineWidth=14*(1-q)+2;x.stroke();x.globalAlpha=1;continue;}
    if(p.k==='spark'){p.px=p.x;p.py=p.y;p.vx*=p.dr;p.vy=p.vy*p.dr+p.g*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;x.globalAlpha=al;x.strokeStyle=p.c;x.lineWidth=p.w;x.lineCap='round';x.beginPath();x.moveTo(p.px-(p.x-p.px)*2.5,p.py-(p.y-p.py)*2.5);x.lineTo(p.x,p.y);x.stroke();x.globalAlpha=1;continue;}
    p.vx*=p.dr;p.vy=p.vy*p.dr+p.g*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.r+=p.vr*dt;x.save();x.translate(p.x,p.y);x.rotate(p.r);x.globalAlpha=al;
    if(p.k==='rect'){x.fillStyle=p.c;x.scale(1,Math.cos(p.t*9+p.w));x.fillRect(-p.w/2,-p.h/2,p.w,p.h);}
    else if(p.k==='star'){starPath(x,0,0,p.w/2,p.w/4.4,5);x.fillStyle=p.c;x.fill();x.lineWidth=3;x.strokeStyle='#0E0B2B';x.stroke();}
    else if(p.k==='icon'){var sc=p.w/24*(p.t<.15?p.t/.15*1.2:1);x.translate(Math.sin(p.t*4+p.ph)*16,0);x.scale(sc,sc);x.translate(-12,-12);x.fillStyle=ICC[p.ic];x.fill(ICP[p.ic]);x.lineWidth=2;x.lineJoin='round';x.strokeStyle='#0E0B2B';x.stroke(ICP[p.ic]);
      if(p.ic==='tomato'){x.strokeStyle='#3BB54A';x.lineWidth=2.4;x.beginPath();x.moveTo(12,6.5);x.lineTo(9,3.5);x.moveTo(12,6.5);x.lineTo(15,3.5);x.stroke();}}
    else if(p.k==='txt'){x.font='48px "Lilita One","Arial Black",sans-serif';x.textAlign='center';x.lineJoin='round';x.lineWidth=10;x.strokeStyle='#0E0B2B';x.strokeText(p.txt,0,0);x.fillStyle=p.c;x.fillText(p.txt,0,0);}
    x.restore();}};

function shake(p,d){if(RM)return;p=p||12;var f=[];for(var i=0;i<8;i++){var k=1-i/8;f.push({transform:'translate('+(rnd(-1,1)*p*k).toFixed(1)+'px,'+(rnd(-1,1)*p*k).toFixed(1)+'px)'});}f.push({transform:'translate(0,0)'});A(tvin,f,{d:d||380,e:'linear',fill:'none'});}
function punch(s){if(RM)return;A(world,[{transform:'scale(1)'},{transform:'scale('+(s||1.04)+')'},{transform:'scale(1)'}],{d:420,e:'cubic-bezier(.2,.8,.3,1)',fill:'none'});}
function flash(o){A($('#tvflash'),[{opacity:o||.8},{opacity:0}],{d:380,fill:'none'});}
/* slam: big entrance with squash, a shake, and a dust ring */
function slam(el,o){o=o||{};var r=o.rot||0;var a=A(el,[{opacity:0,transform:'scale('+(o.from||2.6)+') rotate('+(r-8)+'deg)'},{opacity:1,transform:'scale(.92,1.08) rotate('+r+'deg)',offset:.55},{opacity:1,transform:'scale(1.04,.96) rotate('+r+'deg)',offset:.75},{opacity:1,transform:'scale(1) rotate('+r+'deg)'}],{d:o.d||520,e:'cubic-bezier(.3,.6,.3,1)',delay:o.delay||0});
  setTimeout(function(){if(o.silent)return;SFX.slam();shake(o.sh||10);if(o.ring!==false){var b=el.getBoundingClientRect(),t=tv.getBoundingClientRect(),s=t.width/1280;FX.ring((b.left+b.width/2-t.left)/s,(b.top+b.height/2-t.top)/s,'#FFF8EC',Math.max(120,b.width/s*.7));}kickEyes(el,9);},(o.delay||0)+(o.d||520)*.5);return a;}
function popIn(el,o){o=o||{};return A(el,[{opacity:0,transform:'scale(.3) rotate('+(o.r0||-10)+'deg)'},{opacity:1,transform:'scale(1) rotate('+(o.r||0)+'deg)'}],{sp:'pop',delay:o.delay||0});}
function tvPt(el){var b=el.getBoundingClientRect(),t=tv.getBoundingClientRect(),s=t.width/1280;return {x:(b.left+b.width/2-t.left)/s,y:(b.top+b.height/2-t.top)/s,w:b.width/s,h:b.height/s};}
/* points are earned somewhere on stage, then fly into the team's scoreboard chip; the score rolls when they land */
function flyPts(t,pts,from,o){o=o||{};return new Promise(function(res){if(!pts){res();return;}var p=from&&from.x!=null?from:(from?tvPt(from):{x:640,y:360});var chip=$('#chip-'+t.id);if(!chip){award(t,pts);res();return;}var q=tvPt(chip);
  var el=h('<div class="flypts'+(DARK[t.color]?' lt':'')+'" style="--c:'+t.color+';left:'+p.x.toFixed(0)+'px;top:'+p.y.toFixed(0)+'px">+'+pts+'</div>');tvin.appendChild(el);
  var dx=q.x-p.x,dy=q.y-p.y,T='translate(-50%,-50%) ',st=performance.now()+(o.delay||0);setTimeout(function(){SFX.pop(4);},o.delay||0);setTimeout(function(){SFX.whoop();},(o.delay||0)+480);
  var an=A(el,[{transform:T+'translate(0px,0px) scale(.2) rotate(-25deg)',opacity:0},{transform:T+'translate(0px,-44px) scale(1.3) rotate(-6deg)',opacity:1,offset:.2},{transform:T+'translate(0px,-36px) scale(1) rotate(-6deg)',opacity:1,offset:.42},{transform:T+'translate('+(dx*.45).toFixed(0)+'px,'+(Math.min(dy*.45,0)-110).toFixed(0)+'px) scale(.9) rotate(6deg)',opacity:1,offset:.72},{transform:T+'translate('+dx.toFixed(0)+'px,'+dy.toFixed(0)+'px) scale(.42) rotate(0deg)',opacity:1}],{d:o.d||1300,e:'cubic-bezier(.45,0,.4,1)',delay:o.delay||0});
  var live=true;(function trail(){if(!live)return;if(el.isConnected&&performance.now()>st+250){var r=tvPt(el);FX.P.push({k:'star',x:r.x+rnd(-8,8),y:r.y+rnd(-8,8),vx:rnd(-40,40),vy:rnd(20,80),g:200,dr:.96,r:0,vr:rnd(-6,6),w:rnd(8,14),h:0,c:pick([t.color,'#FFD43B','#FFF8EC']),life:.45,t:0});}setTimeout(trail,50);})();
  done(an).then(function(){live=false;el.remove();award(t,pts);SFX.coin();FX.stars(q.x,q.y,10,t.color);FX.ring(q.x,q.y,t.color,90);res();});});}
/* any little element flies between two TV points */
function flyEl(html,from,to,o){o=o||{};return new Promise(function(res){var el=h(html);el.classList.add('flyel');el.style.left=from.x+'px';el.style.top=from.y+'px';tvin.appendChild(el);var dx=to.x-from.x,dy=to.y-from.y,T='translate(-50%,-50%) ';
  var an=A(el,[{transform:T+'translate(0px,0px) scale('+(o.s0||1)+')'},{transform:T+'translate('+(dx*.5)+'px,'+(dy*.5-(o.arc||120))+'px) scale('+(o.sm||1.3)+') rotate(-12deg)',offset:.5},{transform:T+'translate('+dx+'px,'+dy+'px) scale('+(o.s1||1)+')'}],{d:o.d||700,e:'cubic-bezier(.45,0,.4,1)',delay:o.delay||0});
  done(an).then(function(){el.remove();res();});});}

/* wipe between scenes: the content swaps while the stripe band covers the screen */
var curScene='lobby';
function scene(name,o){o=o||{};var go=function(){$$('.scn').forEach(function(s){s.classList.toggle('on',s.id==='sc-'+name);});curScene=name;};
  if(o.wipe===false){go();return Promise.resolve();}
  SFX.whoosh();var w=$('#wipe');var a=A(w,[{transform:'translateX(-2400px) rotate(-14deg)'},{transform:'translateX(-120px) rotate(-14deg)',offset:.45},{transform:'translateX(120px) rotate(-14deg)',offset:.55},{transform:'translateX(2600px) rotate(-14deg)'}],{d:1000,e:'cubic-bezier(.6,0,.4,1)',fill:'none'});
  return sleep(470).then(function(){go();if(o.build)o.build();return sleep(530);});}

/* ---------- frame loop ---------- */
var _last=performance.now(),_bgAcc=0;
function frame(now){var dt=Math.min(.05,(now-_last)/1000);_last=now;_bgAcc+=dt;if(_bgAcc>1/30){BG.draw(_bgAcc);_bgAcc=0;}FX.draw(dt);stepEyes(dt);HOST.step(dt,now);VF.step(dt);stepFeeds(dt);PFX.draw(dt);requestAnimationFrame(frame);}

/* =====================================================================
   HOST: Sir Socksworth
   ===================================================================== */
var HOST={typing:false,open:0,tgt:0,fin:null,q:Promise.resolve(),t:0,pv:[0,0,0,0]};
(function(){var s=$('#soxsvg');s.innerHTML='<g id="sx-all"><g id="sx-low">'+SOX.lower+'</g><ellipse id="sx-m" cx="102" cy="131" rx="55" ry="3" fill="#3A0F2B" stroke="#0E0B2B" stroke-width="4"/><ellipse id="sx-tg" cx="112" cy="134" rx="24" ry="2" fill="#FF6FA6"/><g id="sx-up">'+SOX.upper
  +'<circle cx="80" cy="86" r="19" fill="#fff" stroke="#0E0B2B" stroke-width="4.5"/><circle id="sx-p1" cx="80" cy="93" r="8.5" fill="#0E0B2B"/><circle cx="128" cy="80" r="21" fill="#fff" stroke="#0E0B2B" stroke-width="4.5"/><circle id="sx-p2" cx="128" cy="88" r="9.5" fill="#0E0B2B"/>'
  +'<ellipse id="sx-l1" cx="80" cy="86" rx="21" ry="0" fill="#FFF3E0" stroke="#0E0B2B" stroke-width="4.5"/><ellipse id="sx-l2" cx="128" cy="80" rx="23" ry="0" fill="#FFF3E0" stroke="#0E0B2B" stroke-width="4.5"/>'
  +'<path id="sx-hap" d="M66 92Q80 76 94 92M112 86Q128 68 144 86" fill="none" stroke="#0E0B2B" stroke-width="5.5" stroke-linecap="round" opacity="0"/>'
  +SOX.brows+'<g id="sx-mono">'+SOX.monocle+'</g></g></g>';
  HOST.all=$('#sx-all');HOST.low=$('#sx-low');HOST.up=$('#sx-up');HOST.m=$('#sx-m');HOST.tg=$('#sx-tg');HOST.p1=$('#sx-p1');HOST.p2=$('#sx-p2');HOST.bl=$('#sx-bl');HOST.br=$('#sx-br');
  HOST.l1=$('#sx-l1');HOST.l2=$('#sx-l2');HOST.hap=$('#sx-hap');HOST.mono=$('#sx-mono');})();
HOST.mood='norm';HOST.moodT=0;HOST.nb=2.5;HOST.bk=0;HOST.lid=0;HOST._mono='';
HOST.step=function(dt,now){HOST.t+=dt;
  if(HOST.moodT>0){HOST.moodT-=dt;if(HOST.moodT<=0){HOST.mood='norm';if(!HOST.typing)HOST.brow('norm');}}
  HOST.nb-=dt;if(HOST.nb<=0){HOST.bk=.13;HOST.nb=rnd(2.2,5);}if(HOST.bk>0)HOST.bk-=dt;
  var md=HOST.mood,k=HOST.typing?18:10,base=md==='shock'?.8:md==='glee'?.5:0;
  HOST.open+=(Math.max(HOST.tgt,base)-HOST.open)*Math.min(1,dt*k);if(!HOST.typing)HOST.tgt=0;var o=HOST.open;
  HOST.low.setAttribute('transform','translate(0 '+(o*14).toFixed(2)+')');HOST.up.setAttribute('transform','translate(0 '+(-o*5).toFixed(2)+')');HOST.m.setAttribute('ry',(3+o*13).toFixed(2));HOST.m.setAttribute('cy',(131+o*4).toFixed(2));
  HOST.tg.setAttribute('ry',(o*6).toFixed(2));HOST.tg.setAttribute('cy',(134+o*9).toFixed(2));
  var sw=Math.sin(HOST.t*1.6)*2.5+(HOST.typing?Math.sin(HOST.t*9)*1.6:0)+(md==='glee'?Math.sin(HOST.t*16)*4:0)+(md==='shock'?Math.sin(HOST.t*40)*1.2:0);HOST.all.setAttribute('transform','rotate('+sw.toFixed(2)+' 100 240)');
  var lt=(md==='glee'||HOST.bk>0)?1:0;HOST.lid+=(lt-HOST.lid)*Math.min(1,dt*(HOST.bk>0?45:16));var lr=HOST.lid<.04?0:HOST.lid;
  HOST.l1.setAttribute('ry',(lr*20.5).toFixed(2));HOST.l2.setAttribute('ry',(lr*22.5).toFixed(2));HOST.hap.setAttribute('opacity',md==='glee'?1:0);
  var pr=md==='shock'?.55:1,lx=Math.sin(HOST.t*.7)*3,ly=Math.cos(HOST.t*1.3)*2;HOST.p1.setAttribute('r',(8.5*pr).toFixed(1));HOST.p2.setAttribute('r',(9.5*pr).toFixed(1));
  HOST.p1.setAttribute('cx',(80+lx).toFixed(1));HOST.p1.setAttribute('cy',(93+ly).toFixed(1));HOST.p2.setAttribute('cx',(128+lx).toFixed(1));HOST.p2.setAttribute('cy',(88+ly).toFixed(1));
  var mt=md==='shock'?'translate(5 -14) rotate(16 128 78)':'';if(mt!==HOST._mono){HOST._mono=mt;HOST.mono.setAttribute('transform',mt);}};
HOST.react=function(m,ms){HOST.mood=m;HOST.moodT=(ms||1200)/1000;if(m!=='norm')HOST.brow('up');if(m==='glee')HOST.hop();if(m==='shock'&&!RM)A($('#host'),[{transform:'translateX(0)'},{transform:'translateX(-6px)'},{transform:'translateX(6px)'},{transform:'translateX(0)'}],{d:180,it:2,fill:'none'});};
HOST.hop=function(){if(RM)return;A($('#host'),[{transform:'translateY(0)'},{transform:'translateY(-44px) rotate(-5deg)',offset:.35},{transform:'translateY(0) scale(1.06,.92)',offset:.72},{transform:'translateY(0)'}],{d:620,e:'cubic-bezier(.3,.7,.4,1)',fill:'none'});};
HOST.brow=function(m){var L={norm:['M58 52Q72 44 88 50','M112 46Q128 38 146 46'],up:['M58 40Q72 30 88 38','M112 34Q128 24 146 32'],down:['M60 46Q74 54 88 56','M112 54Q128 50 144 40']}[m||'norm'];HOST.bl.setAttribute('d',L[0]);HOST.br.setAttribute('d',L[1]);};
var bubble=$('#bubble'),_hideT=null;
/* say(): types the line with voice blips; resolves after it has been on screen long enough to read */
HOST.say=function(text,o){o=o||{};var p=HOST.q.then(function(){return HOST._say(text,o);});HOST.q=p.catch(function(){});return p;};
HOST._say=function(text,o){var g=GEN;return new Promise(function(res,rej){clearTimeout(_hideT);HOST.brow(o.brow||'norm');var plain=text.replace(/\*\*/g,''),html=esc(text).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>');
  var sp=document.createElement('span');bubble.innerHTML='';bubble.appendChild(sp);bubble.style.width='';sp.innerHTML=html;var bw=bubble.offsetWidth;bubble.style.width=(bw+2)+'px';sp.textContent='';if(getComputedStyle(bubble).opacity<.5)A(bubble,[{opacity:0,transform:'scale(.6) rotate(-4deg)'},{opacity:1,transform:'scale(1) rotate(0)'}],{sp:'pop'});else bubble.style.opacity=1;
  HOST.typing=true;setSkip(!!skipFn);var i=0,iv;
  function fin(){clearInterval(iv);HOST.typing=false;HOST.fin=null;sp.innerHTML=html;HOST.brow(o.brow||'norm');setSkip(!!skipFn);var hold=o.hold!=null?o.hold:Math.min(2200,700+plain.length*14);
    setTimeout(function(){if(g!==GEN){rej(CANCEL);return;}res();},o.wait===false?0:hold);_hideT=setTimeout(function(){if(!HOST.typing)A(bubble,[{opacity:1},{opacity:0,transform:'scale(.9)'}],{d:220});},hold+(o.linger||1600));}
  HOST.fin=fin;
  iv=setInterval(function(){if(g!==GEN){clearInterval(iv);HOST.typing=false;rej(CANCEL);return;}i+=2;sp.textContent=plain.slice(0,i);if(i%4===0){SFX.voice();HOST.tgt=rnd(.4,1);}else HOST.tgt=rnd(0,.35);if(i>=plain.length)fin();},34);});};
HOST.finish=function(){if(HOST.fin)HOST.fin();};
HOST.hide=function(){HOST.finish();clearTimeout(_hideT);A(bubble,[{opacity:0}],{d:150});};

/* =====================================================================
   HUD: team chips with rolling scores
   ===================================================================== */
function buildChips(){var c=$('#chips');c.innerHTML='';G.teams.forEach(function(t){c.appendChild(h('<div class="chip empty" id="chip-'+t.id+'">'+badge(t)+'<span class="cn">'+(t.joined?esc(t.name):'Waiting…')+'</span><span class="cs">0</span></div>'));});}
function chipJoin(t){var c=$('#chip-'+t.id);c.outerHTML='<div class="chip'+(t.you?' you':'')+'" id="chip-'+t.id+'">'+badge(t)+'<span class="cn">'+esc(t.name)+'</span><span class="cs">'+t.score+'</span></div>';slam($('#chip-'+t.id),{from:1.8,sh:5,ring:false});}
function rollNum(el,from,to,d){if(!el)return;var t0=performance.now();d=d||900;var lt=0;(function f(n){var k=Math.min(1,(n-t0)/d),v=Math.round(from+(to-from)*(1-Math.pow(1-k,3)));el.textContent=v;if(n-lt>60&&k<1){SFX.rollTick();lt=n;}if(k<1)requestAnimationFrame(f);})(t0);}
function award(t,pts){if(!pts)return;var from=t.score;t.score+=pts;var c=$('#chip-'+t.id);if(c){rollNum(c.querySelector('.cs'),from,t.score);A(c,[{transform:'scale(1)'},{transform:'scale(1.12) rotate(-2deg)'},{transform:'scale(1)'}],{sp:'wobble',fill:'none'});}
  markLeader();if(t.you){pme();PFX.burst(34,[t.color,'#FFD43B','#FFF8EC']);var mb=$('#pme b');if(mb)A(mb,[{transform:'scale(1.9)'},{transform:'scale(1)'}],{sp:'wobble'});}wrank();}
function markLeader(){var max=Math.max.apply(null,G.teams.map(function(t){return t.score;}));G.teams.forEach(function(t){var c=$('#chip-'+t.id);if(c)c.classList.toggle('lead',max>0&&t.score===max);});}
var STAGES=[['Lobby','Teams join from their phones'],['Color Rush','Hunt a color. The Pixel Judge scores it.'],['Brag-Off','Head to head. Mash to swing it.'],['Showstopper','Double points. The room votes.'],['Finale','Champions and the Object of the Night']];
function stage(i){var e=$('#runbar');if(!e)return;e.innerHTML=STAGES.map(function(s,k){return '<div class="'+(k<i?'done':k===i?'on':'')+'"><b>'+s[0]+'</b><small>'+s[1]+'</small><span>'+(k<i?'DONE':k===i?'LIVE':'')+'</span></div>';}).join('');}
function pips(r){stage(r+1);$$('#pips i').forEach(function(p,i){p.className=i<r?'done':i===r?'on':'';});}
$('#tick').innerHTML=(function(){var s='';for(var k=0;k<2;k++)TICKS.forEach(function(t){s+=esc(t)+'<b>●</b>';});return s;})();

/* fake-but-plausible QR on the join card */
(function(){var c=$('#qr'),x=c.getContext('2d'),N=29;x.fillStyle='#fff';x.fillRect(0,0,N,N);x.fillStyle='#0E0B2B';var seed=7;function r(){seed=(seed*16807)%2147483647;return seed/2147483647;}
  function finder(a,b){for(var i=0;i<7;i++)for(var j=0;j<7;j++){if(i===0||i===6||j===0||j===6||(i>1&&i<5&&j>1&&j<5))x.fillRect(a+i,b+j,1,1);}}
  for(var i=0;i<N;i++)for(var j=0;j<N;j++){var inF=(i<8&&j<8)||(i>N-9&&j<8)||(i<8&&j>N-9);if(!inF&&r()<.48)x.fillRect(i,j,1,1);}finder(0,0);finder(N-7,0);finder(0,N-7);})();

/* =====================================================================
   PHONE
   ===================================================================== */
var PFX={c:$('#pfx'),P:[],w:0,h:0,d:1,dirty:false};
PFX.fit=function(){var r=$('#ps').getBoundingClientRect(),d=Math.min(2,window.devicePixelRatio||1);PFX.w=r.width;PFX.h=r.height;PFX.d=d;PFX.c.width=Math.max(1,Math.round(r.width*d));PFX.c.height=Math.max(1,Math.round(r.height*d));};
PFX.burst=function(n,cols,x,y){PFX.fit();cols=cols||CONF;n=RM?Math.ceil(n/3):n;x=x==null?PFX.w/2:x;y=y==null?Math.min(PFX.h*.35,260):y;for(var i=0;i<n;i++){var a=-Math.PI/2+rnd(-1.25,1.25),s=rnd(260,720);PFX.P.push({x:x,y:y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,r:rnd(0,6),vr:rnd(-12,12),w:rnd(7,12),h:rnd(4,8),c:pick(cols),t:0,life:rnd(1.2,2)});}};
PFX.at=function(el,n,cols){if(!el)return;var r=el.getBoundingClientRect(),p=$('#ps').getBoundingClientRect();PFX.burst(n,cols,r.left+r.width/2-p.left,r.top+r.height/2-p.top);};
PFX.draw=function(dt){var x=PFX.c.getContext('2d');if(!PFX.P.length){if(PFX.dirty){x.setTransform(1,0,0,1,0,0);x.clearRect(0,0,PFX.c.width,PFX.c.height);PFX.dirty=false;}return;}PFX.dirty=true;x.setTransform(PFX.d,0,0,PFX.d,0,0);x.clearRect(0,0,PFX.w,PFX.h);
  for(var i=PFX.P.length-1;i>=0;i--){var p=PFX.P[i];p.t+=dt;if(p.t>p.life){PFX.P.splice(i,1);continue;}p.vx*=.985;p.vy=p.vy*.985+1100*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.r+=p.vr*dt;x.save();x.translate(p.x,p.y);x.rotate(p.r);x.scale(1,Math.cos(p.t*9+p.w));x.globalAlpha=Math.min(1,(p.life-p.t)*3);x.fillStyle=p.c;x.fillRect(-p.w/2,-p.h/2,p.w,p.h);x.restore();}};
function parade(){var p=$('#parade');if(!p||p.childElementCount)return;['duck','mug','dino','lava','crown','teddy','donut','robot'].forEach(function(id,i){var o=OBJI[id];var w=h('<div class="pz" style="animation-delay:'+(-i*2.1)+'s"><div class="ph2" style="animation-delay:'+(-i*.17)+'s"></div></div>');w.firstChild.appendChild(sticker({obj:id,eyes:o.eyes}));p.appendChild(w);});}
var CURP='p-join';
function phone(id){var same=CURP===id;CURP=id;$$('.pscr').forEach(function(p){p.classList.toggle('on',p.id===id);});var s=$('#'+id);if(s&&!same)A(s,[{opacity:0,transform:'translateX(30px) rotate(1.2deg)'},{opacity:1,transform:'none'}],{sp:'soft'});}
function pme(){var y=G.you;$('#pme').innerHTML=y.joined?badge(y)+'<b>'+y.score+'</b>':'';}
function press(btn){btn.classList.add('press');setTimeout(function(){btn.classList.remove('press');},90);}

/* ---------- join ---------- */
var tname=$('#tname');tname.value=pick(TEAM_NAMES);
$('#tdice').addEventListener('click',function(){SFX.boing();var n;do{n=pick(TEAM_NAMES);}while(n===tname.value);tname.value=n;hap(8);});
(function(){var sw=$('#swatches');YOU_COLORS.forEach(function(c,i){var b=h('<button role="radio" aria-checked="'+(i===0)+'" aria-label="Badge color '+(i+1)+'" style="background:'+c+'"></button>');b.addEventListener('click',function(){$$('button',sw).forEach(function(x){x.setAttribute('aria-checked','false');});b.setAttribute('aria-checked','true');G.you.color=c;$('#ps').style.setProperty('--team',c);SFX.sel();hap(6);});sw.appendChild(b);});})();
function fan(){var f=$('#fan');f.innerHTML='';shuffle(['mug','duck','crown','dino','donut','teddy','lava','rocket']).slice(0,3).forEach(function(id,i){var o=OBJI[id];var s=sticker({obj:id,eyes:o.eyes});s.style.cssText='left:'+[0,26,54][i]+'px;top:'+[34,0,30][i]+'px;transform:rotate('+[-14,4,16][i]+'deg)';f.appendChild(s);popIn(s,{delay:i*80,r:[-14,4,16][i]});});}
$('#fan').addEventListener('click',function(){SFX.pop(2);fan();});

/* ---------- hold to start ---------- */
(function(){var b=$('#b-start'),t0=0,raf=0,on=false,n=0;
  function stop(){on=false;cancelAnimationFrame(raf);b.style.setProperty('--p',0);}
  b.addEventListener('pointerdown',function(e){if(b.disabled)return;on=true;t0=performance.now();n=0;b.setPointerCapture&&b.setPointerCapture(e.pointerId);(function f(now){if(!on)return;var p=Math.min(1,(now-t0)/850);b.style.setProperty('--p',p);var q=Math.floor(p*4);if(q>n){n=q;SFX.pop(q*2);hap(10);}if(p>=1){on=false;b.style.setProperty('--p',1);if(G._start)G._start();return;}raf=requestAnimationFrame(f);})(t0);});
  ['pointerup','pointercancel','pointerleave'].forEach(function(ev){b.addEventListener(ev,function(){if(on)stop();});});
  b.addEventListener('keydown',function(e){if((e.key==='Enter'||e.key===' ')&&G._start){e.preventDefault();G._start();}});})();

/* ---------- reactions ---------- */
var HYPE=0;
(function(){var r=$('#react');[['star','#FFD43B'],['heart','#FF4FA0'],['flame','#FF7A1F'],['tomato','#F23B2E']].forEach(function(k,i){var b=h('<button aria-label="Send a '+k[0]+'" style="background:'+(i===3?'#FFF8EC':k[1])+'"><svg viewBox="0 0 24 24"><use href="#i-'+k[0]+'"/></svg></button>');var n=0;
  b.addEventListener('click',function(){n++;FX.react(k[0],rnd(300,1180));SFX.react(k[0],n);hap(6);HYPE=Math.min(100,HYPE+6);$('#w-hype').style.width=HYPE+'%';A(b,[{transform:'scale(1)'},{transform:'scale(1.15) rotate(-6deg)'},{transform:'scale(1)'}],{d:200,fill:'none'});});r.appendChild(b);});
  setInterval(function(){if(HYPE>0){HYPE=Math.max(0,HYPE-2);$('#w-hype').style.width=HYPE+'%';}},300);})();
var CROWD_ON=false;
setInterval(function(){if(CROWD_ON&&Math.random()<.55)FX.react(pick(['star','heart','flame','heart','star','tomato']));},420);

/* =====================================================================
   VIEWFINDER: the pannable house
   ===================================================================== */
var VF={el:$('#vf'),front:$('#vffront'),cam:{x:0,y:200},aim:{x:400,y:600},v:{x:0,y:0},s:.5,W:0,H:0,drag:null,lock:null,active:false,tgt:null,t:0,svg:null};
(function(){var s='<svg width="'+HW+'" height="'+HH+'" viewBox="0 0 '+HW+' '+HH+'" aria-hidden="true">'+houseBack()+houseFront()+'<g id="hobjs">';
  OBJ.forEach(function(o){s+='<g id="ho-'+o.id+'"><use href="#o-'+o.id+'" x="'+(o.x-o.s/2)+'" y="'+(o.y-o.s/2)+'" width="'+o.s+'" height="'+o.s+'"/><g class="tk"></g></g>';});
  s+='</g></svg>';VF.front.innerHTML=s;VF.svg=VF.front.firstChild;})();
VF.measure=function(){var r=VF.el.getBoundingClientRect();VF.W=r.width;VF.H=r.height;if(!VF.W)return;VF.s=Math.max(VF.W/680,VF.H/HH);VF.vw=VF.W/VF.s;VF.vh=VF.H/VF.s;};
VF.clamp=function(){VF.aim.x=clamp(VF.aim.x,30,HW-30);VF.aim.y=clamp(VF.aim.y,40,HH-40);VF.cam.x=clamp(VF.aim.x-VF.vw/2,0,Math.max(0,HW-VF.vw));VF.cam.y=clamp(VF.aim.y-VF.vh/2,0,Math.max(0,HH-VF.vh));};
VF.goZone=function(z){VF.measure();VF.tgt={x:z*800+400,y:VF.aim.y};SFX.whoop();};
VF.aimAt=function(o){VF.tgt={x:o.x,y:o.y};};
VF.reset=function(){VF.measure();VF.aim={x:400,y:640};VF.v={x:0,y:0};VF.lock=null;VF.tgt=null;VF.clamp();
  OBJ.forEach(function(o){var g=$('#ho-'+o.id);g.style.opacity=1;g.querySelector('.tk').innerHTML='';});VF.label(null);$('#vfeed').innerHTML='';};
VF.step=function(dt){if(!VF.active)return;VF.t+=dt;if(!VF.W)VF.measure();if(!VF.W)return;
  if(VF.tgt){VF.aim.x+=(VF.tgt.x-VF.aim.x)*Math.min(1,dt*7);VF.aim.y+=(VF.tgt.y-VF.aim.y)*Math.min(1,dt*7);if(Math.abs(VF.tgt.x-VF.aim.x)<1&&Math.abs(VF.tgt.y-VF.aim.y)<1)VF.tgt=null;}
  else if(!VF.drag){VF.aim.x+=VF.v.x*dt;VF.aim.y+=VF.v.y*dt;VF.v.x*=Math.pow(.02,dt);VF.v.y*=Math.pow(.02,dt);}
  VF.clamp();
  var sx=Math.sin(VF.t*1.1)*3+Math.sin(VF.t*2.7)*1.2,sy=Math.cos(VF.t*.9)*2.4;
  VF.front.style.transform='translate('+(-VF.cam.x*VF.s+sx).toFixed(1)+'px,'+(-VF.cam.y*VF.s+sy).toFixed(1)+'px) scale('+VF.s.toFixed(4)+')';
  var bk=$('#brk');bk.style.left=((VF.aim.x-VF.cam.x)*VF.s+sx).toFixed(1)+'px';bk.style.top=((VF.aim.y-VF.cam.y)*VF.s+sy).toFixed(1)+'px';
  var cx=VF.aim.x,cy=VF.aim.y,best=null,bd=1e9;OBJ.forEach(function(o){var d=Math.hypot(o.x-cx,o.y-cy);if(d<bd){bd=d;best=o;}});
  var lk=best&&bd<Math.max(64,best.s*.55)?best:null;if(lk!==VF.lock){VF.lock=lk;VF.label(lk);if(lk){SFX.lock();hap(5);}}
  var z=cx<800?0:cx<1600?1:2;if(z!==VF.z){VF.z=z;$('#vzone').textContent=['LIVING ROOM','KITCHEN',"KIDS' ROOM"][z];$$('#zones button').forEach(function(b,i){b.classList.toggle('on',i===z);});}};
VF.label=function(o){var l=$('#olab'),b=$('#brk');if(!o){l.className='olab none';b.className='brk';b.style.width=b.style.height='150px';b.style.margin='-75px 0 0 -75px';return;}
  var tk=G.taken[o.id];l.className='olab'+(tk?' taken':'');l.textContent=tk?'Taken by '+team(tk).name:o.nm;b.className='brk lock'+(tk?' taken':'');var sz=Math.round(o.s*VF.s*1.18+16);b.style.width=b.style.height=sz+'px';b.style.margin=(-sz/2)+'px 0 0 '+(-sz/2)+'px';};
VF.markTaken=function(o,t){var g=$('#ho-'+o.id);if(!g)return;g.style.opacity=.55;var x=o.x,y=o.y;g.querySelector('.tk').innerHTML='<g transform="translate('+x+' '+y+') rotate(-12)"><rect x="-62" y="-20" width="124" height="40" rx="10" fill="'+t.color+'" stroke="#0E0B2B" stroke-width="5"/><text x="0" y="11" text-anchor="middle" font-family="Lilita One,Arial Black,sans-serif" font-size="30" fill="#0E0B2B">TAKEN</text></g>';
  if(VF.lock===o)VF.label(o);};
VF.feed=function(t,txt){var f=$('#vfeed');var d=h('<div>'+badge(t)+'<span>'+esc(txt)+'</span></div>');f.prepend(d);A(d,[{opacity:0,transform:'translateX(-20px)'},{opacity:1,transform:'none'}],{sp:'pop'});setTimeout(function(){A(d,[{opacity:1},{opacity:0}],{d:300}).finished.then(function(){d.remove();}).catch(function(){});},2600);while(f.children.length>2)f.lastChild.remove();};
(function(){var el=VF.el,last=null,moved=0,down=null;
  el.addEventListener('pointerdown',function(e){if(!VF.active)return;el.setPointerCapture(e.pointerId);VF.drag={x:e.clientX,y:e.clientY};down={x:e.clientX,y:e.clientY,t:performance.now()};last={x:e.clientX,y:e.clientY,t:performance.now()};moved=0;VF.v={x:0,y:0};VF.tgt=null;el.classList.add('drag');});
  el.addEventListener('pointermove',function(e){if(!VF.drag)return;var dx=e.clientX-VF.drag.x,dy=e.clientY-VF.drag.y;VF.drag={x:e.clientX,y:e.clientY};moved+=Math.abs(dx)+Math.abs(dy);VF.aim.x-=dx/VF.s;VF.aim.y-=dy/VF.s;
    var n=performance.now(),dt=Math.max(1,n-last.t)/1000;VF.v={x:-(e.clientX-last.x)/VF.s/dt*.9,y:-(e.clientY-last.y)/VF.s/dt*.9};last={x:e.clientX,y:e.clientY,t:n};});
  function up(e){if(!VF.drag)return;VF.drag=null;el.classList.remove('drag');if(performance.now()-last.t>80)VF.v={x:0,y:0};
    if(moved<8&&down){var r=el.getBoundingClientRect(),hx=VF.cam.x+(e.clientX-r.left)/VF.s,hy=VF.cam.y+(e.clientY-r.top)/VF.s,best=null,bd=1e9;OBJ.forEach(function(o){var d=Math.hypot(o.x-hx,o.y-hy);if(d<bd){bd=d;best=o;}});if(best&&bd<best.s*.7){VF.aimAt(best);SFX.tap();}}}
  el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);
  el.tabIndex=0;el.addEventListener('keydown',function(e){var k={ArrowLeft:[-120,0],ArrowRight:[120,0],ArrowUp:[0,-120],ArrowDown:[0,120]}[e.key];if(k){e.preventDefault();VF.tgt={x:VF.aim.x+k[0],y:VF.aim.y+k[1]};}if(e.key===' '||e.key==='Enter'){e.preventDefault();$('#shutter').click();}});})();
$$('#zones button').forEach(function(b){b.addEventListener('click',function(){VF.goZone(+b.dataset.z);});});
window.addEventListener('resize',function(){if(VF.active){VF.measure();VF.clamp();}});

/* =====================================================================
   FINDS
   ===================================================================== */
function newFind(t,o,extra){var f={team:t.id,obj:o?o.id:null,photo:null,nm:o?o.nm:'Your photo',name:o?o.names[0]:pick(GEN_NAMES),brag:o?o.brags[0]:pick(GEN_BRAGS),eyes:o?o.eyes:null,col:o?o.col:'#888888',t:o?o.t:null,time:0,order:0,pts:0,match:0,votes:0,r:G.r};
  if(extra)for(var k in extra)f[k]=extra[k];return f;}
function fitness(o,P){if(P.kind==='color')return colorMatch(o.col,P.hex);return (o.t[P.t]||0)*10;}
function traitOf(f,P){if(f.t)return f.t[P.t]||0;return f.ai&&f.ai.score!=null?f.ai.score:5.5;}
function botPick(P){var c=OBJ.filter(function(o){return !G.taken[o.id];}).map(function(o){return {o:o,s:fitness(o,P)+rnd(0,P.kind==='color'?30:40)};});c.sort(function(a,b){return b.s-a.s;});return c[0].o;}
function botFind(t,P){var o=botPick(P);var f=newFind(t,o,{name:pick(o.names),brag:pick(o.brags)});return f;}

/* =====================================================================
   SCENE BUILDERS (TV)
   ===================================================================== */
function promptParts(P){if(P.kind==='color')return {a:'Snag the most',b:P.k,c:'thing in the house',col:P.hex};return {a:P.a,b:P.b,c:P.c,col:P.col};}
var MAG='<svg viewBox="0 0 70 70" aria-hidden="true"><circle cx="30" cy="30" r="18" fill="rgba(255,248,236,.18)" stroke="#FFF8EC" stroke-width="7"/><path d="M44 44L60 60" stroke="#FFF8EC" stroke-width="10" stroke-linecap="round"/><path d="M22 24Q26 18 32 18" stroke="#FFF8EC" stroke-width="4" fill="none" stroke-linecap="round"/></svg>';
function buildHunt(P){var s=$('#sc-hunt'),pp=promptParts(P);
  var art=P.kind==='color'?'<div class="sw" style="background:'+P.hex+'"></div>':'<div class="pic stk">'+stickerSVG({obj:P.ic})+'</div>';
  s.innerHTML='<div class="L tcard pcard" id="h-pc"><span class="pillk pk" id="h-pk">Snag it</span><div class="pt"><div class="p1">'+esc(pp.a)+'</div><div class="p2" style="color:'+pp.col+'">'+esc(pp.b)+'</div><div class="p1" style="font-size:22px">'+esc(pp.c)+'</div></div>'+art+'</div>'
   +'<div class="L watch" id="h-w"><svg viewBox="0 0 236 236"><rect x="98" y="2" width="40" height="26" rx="8" fill="#FFF8EC" stroke="#0E0B2B" stroke-width="6"/><circle cx="118" cy="132" r="100" fill="#FFF8EC" stroke="#0E0B2B" stroke-width="8"/><circle cx="118" cy="132" r="84" fill="none" stroke="#E8DECB" stroke-width="16"/><circle id="h-arc" cx="118" cy="132" r="84" fill="none" stroke="#B8F23B" stroke-width="16" stroke-linecap="round" stroke-dasharray="527.8" stroke-dashoffset="0" transform="rotate(-90 118 132)"/></svg><div class="wn" id="h-wn">35</div></div>'
   +'<div class="L wlab" id="h-wl">SECONDS<br>LEFT</div><div class="L slots" id="h-slots"></div>';
  G.teams.forEach(function(t,i){$('#h-slots').appendChild(h('<div class="slot" id="slot-'+t.id+'">'+buildFeed(t,i)+'<div class="sh">'+badge(t)+esc(t.name)+'</div></div>'));});}
var HOUSE_URL=null;
function houseURL(){if(HOUSE_URL)return HOUSE_URL;var defs='';OBJ.forEach(function(o){defs+='<symbol id="o-'+o.id+'" viewBox="0 0 120 120" overflow="visible">'+ART[o.id]+'</symbol>';});
  var s='<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="600" viewBox="0 0 2400 1200"><defs>'+defs+'</defs>'+houseBack()+houseFront();
  OBJ.forEach(function(o){s+='<use href="#o-'+o.id+'" xlink:href="#o-'+o.id+'" x="'+(o.x-o.s/2)+'" y="'+(o.y-o.s/2)+'" width="'+o.s+'" height="'+o.s+'"/>';});s+='</svg>';
  try{HOUSE_URL=URL.createObjectURL(new Blob([s],{type:'image/svg+xml'}));}catch(e){HOUSE_URL='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(s);}return HOUSE_URL;}
var FEEDS={},FEED_ON=false,FS=.3;
function buildFeed(t,i){return '<div class="feed" id="fd-'+t.id+'" style="--c:'+t.color+'"><div class="fv"><img alt="" src="'+houseURL()+'" width="720" height="360"></div><div class="fscan"></div><div class="fret"><i></i><i></i><i></i><i></i></div><span class="frec"><b></b>CAM '+(i+1)+'</span><span class="flab">Searching…</span><div class="fflash"></div></div>';}
function initFeeds(){FEEDS={};G.teams.forEach(function(t){var el=$('#fd-'+t.id);if(!el)return;var o=pick(OBJ);FEEDS[t.id]={el:el,img:el.querySelector('img'),lab:el.querySelector('.flab'),ret:el.querySelector('.fret'),x:o.x+rnd(-200,200),y:o.y,tx:o.x,ty:o.y,nt:0,lock:false,sp:2,t:rnd(0,9),last:''};});FEED_ON=true;}
function setLab(F,s){if(F.last!==s){F.last=s;F.lab.textContent=s;}}
function stepFeeds(dt){if(!FEED_ON||curScene!=='hunt')return;for(var id in FEEDS){var F=FEEDS[id];if(!F.el.isConnected)continue;F.t+=dt;
  if(id==='you'&&!F.lock){F.tx=VF.aim.x;F.ty=VF.aim.y;F.sp=10;setLab(F,VF.lock?VF.lock.nm:'Searching…');}
  else if(!F.lock&&F.t>F.nt){var c=OBJ.filter(function(o){return !G.taken[o.id];}),o=pick(c);F.tx=o.x+rnd(-70,70);F.ty=o.y+rnd(-50,50);F.nt=F.t+rnd(1.1,2.3);F.sp=rnd(1.6,2.6);setLab(F,pick(['Eyeing the','Hmm, the','Maybe the','Ooh, the'])+' '+o.nm.toLowerCase()+'?');}
  F.x+=(F.tx-F.x)*Math.min(1,dt*F.sp);F.y+=(F.ty-F.y)*Math.min(1,dt*F.sp);
  var W=F.el.clientWidth,H=F.el.clientHeight;if(!W)continue;var jx=Math.sin(F.t*2.1)*5+Math.sin(F.t*5.3)*2,jy=Math.cos(F.t*1.7)*4;
  var X=clamp(F.x*FS-W/2+jx,0,720-W),Y=clamp(F.y*FS-H/2+jy,0,360-H);F.img.style.transform='translate('+(-X).toFixed(1)+'px,'+(-Y).toFixed(1)+'px)';
  F.ret.style.transform='translate('+(F.x*FS-X-W/2).toFixed(1)+'px,'+(F.y*FS-Y-H/2).toFixed(1)+'px)';}}
function feedLock(f){var F=FEEDS[f.team];if(!F)return;F.lock=true;var o=f.obj?OBJI[f.obj]:null;if(o){F.tx=o.x;F.ty=o.y;F.sp=9;}F.el.classList.add('lock');setLab(F,'Snagged: '+(o?o.nm.toLowerCase():'a real thing'));
  setTimeout(function(){if(!F.el.isConnected)return;A(F.el.querySelector('.fflash'),[{opacity:1},{opacity:0}],{d:380,fill:'none'});},300);}
function setWatch(left,total){var a=$('#h-arc'),n=$('#h-wn'),w=$('#h-w');if(!a)return;a.setAttribute('stroke-dashoffset',(527.8*(1-left/total)).toFixed(1));var s=Math.ceil(left);if(n.textContent!==String(s))n.textContent=s;
  w.classList.toggle('urgent',left<=10);a.setAttribute('stroke',left<=10?'#F23B2E':'#B8F23B');}
function slotSnag(f){var t=team(f.team),sl=$('#slot-'+t.id);if(!sl)return;var old=sl.querySelector('.cardback');if(old)old.remove();
  var md=['1ST','2ND','3RD','4TH'][f.order-1]||'';var cb=h('<div class="cardback" style="--c:'+t.color+'"><div class="q">?</div><span class="md s'+f.order+'">'+md+'</span><span class="tm">'+fmt(f.time)+'</span></div>');sl.appendChild(cb);slam(cb,{from:1.6,sh:7});
  var p=tvPt(sl);var b=h('<div class="burst" style="left:'+p.x+'px;top:'+(p.y-20)+'px"><span>SNAGGED!</span></div>');$('#sc-hunt').appendChild(b);A(b,[{opacity:0,transform:'scale(.2) rotate(-30deg)'},{opacity:1,transform:'scale(1) rotate(-8deg)',offset:.4},{opacity:1,transform:'scale(1) rotate(-6deg)',offset:.8},{opacity:0,transform:'scale(1.2) rotate(-6deg)'}],{d:1300}).finished.then(function(){b.remove();}).catch(function(){});
  FX.confetti(p.x,p.y,26,{cols:[t.color,'#FFF8EC','#FFD43B'],pow:700});
  if(f.order===1&&G.cur.P.kind==='color'){var bon=h('<div class="ribbon" style="left:'+(p.x-80)+'px;top:'+(p.y+58)+'px">FIRST SNAG +30</div>');$('#sc-hunt').appendChild(bon);popIn(bon,{r:-4});}}
function slotState(t,txt,cls){var sl=$('#slot-'+t.id);if(!sl)return;var cb=sl.querySelector('.cardback');if(!cb)return;var g=cb.querySelector('.gl');if(!g){g=h('<span class="gl"></span>');cb.appendChild(g);}g.textContent=txt;
  if(cls==='ready'){var st=h('<div class="stamp" style="left:60px;top:66px;transform:rotate(-12deg)">READY</div>');sl.appendChild(st);slam(st,{from:2.2,sh:4,ring:false,rot:-12,d:420});}}

/* fly a sticker element from the phone to a TV spot (desktop: sideways; phone: upward) */
function flyTo(srcEl,f,targetEl,o){o=o||{};return new Promise(function(res){var a=srcEl.getBoundingClientRect(),b=targetEl.getBoundingClientRect();if(!a.width||!b.width){res();return;}
  var sz=Math.max(70,Math.min(a.width,160));var el=h('<div class="fly" style="left:'+(a.left+a.width/2-sz/2)+'px;top:'+(a.top+a.height/2-sz/2)+'px;width:'+sz+'px;height:'+sz+'px"></div>');el.appendChild(sticker(f,{eyes:o.eyes}));document.body.appendChild(el);
  var dx=b.left+b.width/2-(a.left+a.width/2),dy=b.top+b.height/2-(a.top+a.height/2),sc=Math.max(.3,Math.min(b.width,b.height)*.8/sz);
  SFX.whoop();var an=A(el,[{transform:'translate(0,0) scale(1) rotate(0)'},{transform:'translate('+(dx*.45)+'px,'+(dy*.45-140)+'px) scale(1.25) rotate(-200deg)',offset:.5},{transform:'translate('+dx+'px,'+dy+'px) scale('+sc+') rotate(-360deg)'}],{d:780,e:'cubic-bezier(.45,0,.3,1)'});
  done(an).then(function(){el.remove();res();});});}

/* =====================================================================
   FLOWS
   ===================================================================== */
async function lobbyFlow(rejoin){
  HOST.brow('norm');parade();$('#ps').style.setProperty('--team',G.you.color);
  if(!rejoin){
    phone('p-join');fan();
    var s=$('#lgs'),a=$('#lga'),b=$('#lgb'),t=$('#lgt');[s,a,b,t,$('#joincard')].forEach(function(e){e.style.opacity=0;});
    await sleep(300);slam(s,{rot:-5,silent:true});await sleep(260);popIn(a,{r:10});await sleep(200);slam(b,{rot:-2,silent:true});await sleep(240);popIn(t,{r:-2});popIn($('#joincard'),{r:2,delay:120});
    A(s,[{transform:'rotate(-5deg)'},{transform:'rotate(-3deg) translateY(-6px)'},{transform:'rotate(-5deg)'}],{d:2600,it:Infinity,e:'ease-in-out',delay:900,fill:'none'});
    A(b,[{transform:'rotate(-2deg)'},{transform:'rotate(-4deg) translateY(-5px)'},{transform:'rotate(-2deg)'}],{d:3000,it:Infinity,e:'ease-in-out',delay:1200,fill:'none'});
    A(a,[{transform:'rotate(10deg)'},{transform:'rotate(-6deg) scale(1.06)'},{transform:'rotate(10deg)'}],{d:2200,it:Infinity,e:'ease-in-out',delay:1000,fill:'none'});
    HOST.say('Good evening! I am **Sir Socksworth**, and tonight your stuff gets famous. Grab a phone and join!',{hold:2400});
    await new Promise(function(res){if(G.joinReq)res();else G._join=res;});
  }
  G._join=null;var y=G.you;y.joined=true;
  chipJoin(y);SFX.join();HOST.react('glee',1200);PFX.burst(40,[y.color,'#FFD43B','#FFF8EC']);FX.confetti(tvPt($('#chip-you')).x,90,40,{ang:Math.PI/2,spread:1.2,pow:500});pme();
  var dots=$$('#jpd span');dots[0].classList.add('on');
  phone('p-lobby');$('#lob-badge').innerHTML=badge(y);$('#lob-name').textContent=y.name;renderRoster();rundown('#rundown1',-1);$('#b-start').disabled=true;$('#b-start-l').textContent='Waiting for teams…';
  HOST.say('Welcome, **'+y.name+'**! Lovely badge. Very you.',{brow:'up'});
  for(var i=1;i<G.teams.length;i++){await sleep(rnd(700,1200));var t=G.teams[i];t.joined=true;chipJoin(t);SFX.join();dots[i]&&dots[i].classList.add('on');renderRoster();}
  await sleep(300);$('#b-start').disabled=false;$('#b-start-l').textContent='Hold to go live';A($('#b-start'),[{transform:'scale(1)'},{transform:'scale(1.05)'},{transform:'scale(1)'}],{d:700,it:3,fill:'none'});
  HOST.say('Four teams! Host phone, **hold the button** when you are ready.',{brow:'up'});
  await new Promise(function(res){G._start=res;});G._start=null;SFX.horn();hap([20,40,20]);
}
function rundown(el,cur){var e=$(el);if(!e)return;e.innerHTML='';ROUNDS.forEach(function(R,i){var st=i<cur?'Done':i===cur?'Now':'Next';e.appendChild(h('<div class="lrow'+(i<cur?' done':i===cur?' now':'')+'"><span class="n">'+(i+1)+'</span><div>'+esc(R.nice)+'<small>'+esc(R.sub)+'</small></div><span class="st">'+st+'</span></div>'));});}
function wrank(){var e=$('#w-rank');if(!e)return;e.innerHTML='';G.teams.slice().sort(function(a,b){return b.score-a.score;}).forEach(function(t,i){e.appendChild(h('<div class="lrow'+(t.you?' me':'')+'">'+badge(t)+'<div>'+(i+1)+'. '+esc(t.name)+'</div><span class="v">'+t.score+'</span></div>'));});}
function renderRoster(){var r=$('#roster');r.innerHTML='';G.teams.forEach(function(t){r.appendChild(h('<div class="lrow'+(t.you?' me':'')+'">'+badge(t)+'<div>'+esc(t.name)+(t.you?'<small>You · host phone</small>':'<small>Rival team</small>')+'</div><span class="st'+(t.joined?' ok':'')+'">'+(t.joined?'Ready':'Joining…')+'</span></div>'));});}

function choosePrompt(kind){
  if(kind==='color'){var ok=COLORS.filter(function(c){return OBJ.filter(function(o){return colorMatch(o.col,c.hex)>85;}).length>=2;});var c=pick(ok);return {kind:'color',k:c.k,hex:c.hex};}
  var p=pick(kind==='brag'?BRAGP:SHOWP);return {kind:kind,t:p.t,a:p.a,b:p.b,c:p.c,col:p.col,ic:p.ic};}

function bulbs(el,x,y,w,hh){var s='',per=2*(w+hh),n=Math.round(per/44),i;for(i=0;i<n;i++){var d=i/n*per,px,py;if(d<w){px=x+d;py=y;}else if(d<w+hh){px=x+w;py=y+d-w;}else if(d<2*w+hh){px=x+w-(d-w-hh);py=y+hh;}else{px=x;py=y+hh-(d-2*w-hh);}s+='<i style="left:'+px.toFixed(0)+'px;top:'+py.toFixed(0)+'px"></i>';}el.innerHTML=s;}
async function introFlow(r){var R=ROUNDS[r],P=G.cur.P,pp=promptParts(P);pips(r);
  MUS.set('tension');BG.set('normal');
  await scene('intro',{build:function(){$('#sc-intro').innerHTML='<div class="L ik"><span class="pillk y" id="i-k">'+R.k+'</span></div><div class="L it mega" id="i-t">'+R.name+'</div><div class="L isub" id="i-s">'+esc(R.sub)+'</div>'
    +'<div class="L tcard reelwin" id="i-reel" style="opacity:0"><div class="strip" id="i-strip"></div></div><div class="reelarr l" id="i-al" style="opacity:0"></div><div class="reelarr r" id="i-ar" style="opacity:0"></div><div class="L bulbs" id="i-bulbs" style="opacity:0"></div><div class="L cdn mega" id="i-c"></div>';bulbs($('#i-bulbs'),150,118,980,330);
    ['#i-k','#i-t','#i-s'].forEach(function(s){$(s).style.opacity=0;});}});
  phone('p-ready');$('#rd-k').textContent=R.k;$('#rd-h').textContent=R.nice;$('#rd-s').textContent=R.sub;$('#rd-card').hidden=true;$('#rd-c').textContent='';rundown('#rundown2',r);
  popIn($('#i-k'),{r:-3});await sleep(250);slam($('#i-t'),{rot:-3,sh:14});FX.confetti(640,260,60,{pow:1000});punch(1.05);await sleep(500);popIn($('#i-s'));
  await HOST.say(r===0?'Round one: **Color Rush**! The Pixel Judge sees all. Even the fridge.':r===1?'Round two: the **Brag-Off**! Head to head, mash your phones, shout at your relatives.':'The final round: the **Showstopper**! Double points. No mercy. Some mercy.',{hold:900});
  /* reel */
  A($('#i-t'),[{opacity:1,transform:'rotate(-3deg)'},{opacity:0,transform:'translateY(-160px) rotate(-10deg) scale(.6)'}],{d:380,e:'ease-in'});A($('#i-s'),[{opacity:1},{opacity:0}],{d:250});A($('#i-k'),[{opacity:1},{opacity:0}],{d:250});
  await sleep(250);var reel=$('#i-reel'),strip=$('#i-strip'),N=16,cards=[];
  for(var i=0;i<N-1;i++){var q=choosePrompt(P.kind),qq=promptParts(q);cards.push(qq);}cards.push(pp);
  strip.innerHTML=cards.map(function(c){return '<div class="rc"><small>'+esc(c.a.toUpperCase())+'</small><b style="color:'+c.col+'">'+esc(c.b)+'</b><small>'+esc(c.c.toUpperCase())+'</small></div>';}).join('');
  popIn(reel);popIn($('#i-al'));popIn($('#i-ar'));var bb=$('#i-bulbs');A(bb,[{opacity:0},{opacity:1}],{d:200});bb.classList.add('fast');SFX.drumroll(2.3);
  await new Promise(function(res){var t0=performance.now(),D=2400,H=320,lastI=0;(function f(n){var k=Math.min(1,(n-t0)/D),e=1-Math.pow(1-k,4),y=e*(N-1)*H;strip.style.transform='translateY('+(-y)+'px)';var idx=Math.floor(y/H+.5);if(idx!==lastI){lastI=idx;SFX.tick();}if(k<1)requestAnimationFrame(f);else res();})(t0);});
  bb.classList.remove('fast');bb.classList.add('all');setTimeout(function(){bb.classList.remove('all');},800);SFX.reveal();SFX.slam();shake(14);flash(.6);punch(1.06);HOST.react('glee',900);FX.confetti(640,280,70,{cols:[pp.col,'#FFF8EC','#FFD43B'],pow:1100});kickEyes(null,8);
  $('#rd-card').hidden=false;$('#rd-p').innerHTML=esc(pp.a)+' <span style="color:'+pp.col+'">'+esc(pp.b)+'</span> '+esc(pp.c);popIn($('#rd-card'));
  await HOST.say(P.kind==='color'?'Find the most **'+P.k.toLowerCase()+'** thing you can. Closest color wins.':'**'+pp.a+' '+pp.b.toLowerCase()+'**. Be bold. Be weird.',{hold:700,brow:'up'});
  /* countdown */
  A(reel,[{opacity:1,transform:'none'},{opacity:0,transform:'scale(.8)'}],{d:260});A(bb,[{opacity:1},{opacity:0}],{d:200});A($('#i-al'),[{opacity:1},{opacity:0}],{d:200});A($('#i-ar'),[{opacity:1},{opacity:0}],{d:200});
  var c=$('#i-c');for(var n=3;n>=1;n--){c.textContent=n;c.style.color=n===1?'#FF4FA0':'#FFD43B';$('#rd-c').textContent=n;SFX.beep(0);hap(15);
    A(c,[{opacity:0,transform:'scale(2.2)'},{opacity:1,transform:'scale(1)',offset:.35},{opacity:1,transform:'scale(.95)',offset:.8},{opacity:0,transform:'scale(.7)'}],{d:760});A($('#rd-c'),[{transform:'scale(1.6)'},{transform:'scale(1)'}],{sp:'pop'});await sleep(760);}
  c.textContent='SNAG!';c.style.color='#B8F23B';c.style.fontSize='250px';c.style.top='150px';$('#rd-c').textContent='GO!';SFX.beep(1);SFX.horn();hap([30,30,60]);flash(.7);shake(16);FX.confetti(640,320,90,{pow:1300});
  A(c,[{opacity:0,transform:'scale(2.5) rotate(-10deg)'},{opacity:1,transform:'scale(1) rotate(-4deg)',offset:.3},{opacity:1,transform:'scale(1.05) rotate(-4deg)',offset:.8},{opacity:0,transform:'scale(1.4) rotate(-4deg)'}],{d:900});
  await sleep(650);
}

/* ---------- HUNT ---------- */
var HUNT_S=35,GLOW_S=15;
async function huntFlow(){var P=G.cur.P,t0=performance.now();G.taken={};G.sent=false;G.cur.order=0;G.cur.finds={};
  await scene('hunt',{build:function(){buildHunt(P);}});initFeeds();MUS.set('hunt');BG.set('normal');
  var pc=$('#cchip'),pp=promptParts(P);pc.innerHTML='<span class="k">SNAG</span><span class="t">'+esc(pp.a)+' <em style="color:'+(pp.col==='#FFD43B'||pp.col==='#B8F23B'?'#B07A00':pp.col)+'">'+esc(pp.b)+'</em> '+esc(pp.c)+'</span>'+(P.kind==='color'?'<span class="dot" style="background:'+P.hex+'"></span>':'');
  phone('p-cam');VF.active=true;VF.reset();CAM.enable(true);
  var bots=G.teams.filter(function(t){return !t.you;}),times=shuffle([rnd(4,8),rnd(10,17),rnd(17,27)]);bots.forEach(function(t,i){t._at=times[i];t._done=false;});
  var urgent=false,endAt=null;
  G.cur.onSnag=function(f){G.cur.order++;f.order=G.cur.order;f.time=(performance.now()-t0)/1000;G.cur.finds[f.team]=f;G.taken[f.obj||('photo-'+f.team)]=f.team;feedLock(f);setTimeout(function(){slotSnag(f);},640);};
  await phase(HUNT_S*1000,function(el,ms){var left=(ms-el)/1000;setWatch(left,HUNT_S);CAM.time(left,HUNT_S);
    bots.forEach(function(t){if(!t._done&&el/1000>=t._at){t._done=true;var f=botFind(t,P);G.cur.onSnag(f);VF.markTaken(OBJI[f.obj],t);VF.feed(t,t.name+' snagged the '+OBJI[f.obj].nm.toLowerCase());SFX.rival();HOST.react('shock',800);
      if(f.order===1&&!G.cur.finds.you)HOST.say('**'+t.name+'** snagged first!'+(P.kind==='color'?' Speed bonus!':' Show-offs.'),{brow:'up',hold:600});}});
    if(!urgent&&left<=10){urgent=true;MUS.set('urgent');BG.set('urgent');SFX.riser(1.2);if(!G.cur.finds.you)HOST.say('Ten seconds! Grab **anything**!',{brow:'up',hold:400});}
    if(urgent&&Math.ceil(left)!==Math.ceil(left+.05))SFX.tick();
    var all=G.teams.every(function(t){return G.cur.finds[t.id];});if(all&&endAt==null)endAt=el+1300;return endAt!=null&&el>=endAt;});
  CAM.enable(false);
  bots.forEach(function(t){if(!t._done){t._done=true;var f=botFind(t,P);G.cur.onSnag(f);VF.markTaken(OBJI[f.obj],t);SFX.rival();}});
  if(!G.cur.finds.you){var o=VF.lock&&!G.taken[VF.lock.id]?VF.lock:OBJ.filter(function(x){return !G.taken[x.id];})[0];CAM.snag(o,true);}
  VF.active=false;
  var tm=h('<div class="L toast"><b>TIME!</b></div>');$('#sc-hunt').appendChild(tm);slam(tm.firstChild,{sh:16});SFX.buzzer();HOST.react('shock',1000);MUS.set('tension');BG.set('normal');
  await sleep(900);A(tm,[{opacity:1},{opacity:0}],{d:300});
  /* glow-up wait */
  bots.forEach(function(t,i){setTimeout(function(){slotState(t,'','ready');SFX.stamp();},300+i*350);});
  if(!G.sent){$('#h-pk').textContent='Glow up';$('#h-wl').innerHTML='GLOW-UP<br>TIME';slotState(G.you,'GLOWING UP');
    HOST.say('Glow-up time! Eyes on, names on, brags ready.',{hold:500});
    await phase(GLOW_S*1000,function(el,ms){var left=(ms-el)/1000;setWatch(left,GLOW_S);$('#gtime').textContent=fmt(left);return G.sent;});
    if(!G.sent)await GLOW.send(true);}
  await sleep(700);FEED_ON=false;
}

/* ---------- phone camera controls ---------- */
var CAM={on:false,
  enable:function(on){CAM.on=on;$('#shutter').disabled=!on;$('#b-real').disabled=!on;},
  time:function(left,total){$('#cbari').style.transform='scaleX('+(left/total)+')';var low=left<=10;$('#cbar').classList.toggle('low',low);var tt=$('#ctime');tt.textContent=fmt(left);tt.classList.toggle('low',low);
    if(CURP==='p-glow')$('#gtime').textContent=fmt(left);},
  snag:function(o,panic){if(!o)return;var f=newFind(G.you,o);G.cur.onSnag(f);VF.markTaken(o,G.you);SFX.snagged();hap([20,30,40]);if(!panic){HOST.react('glee',900);PFX.at($('#vf'),36,[G.you.color,'#FFD43B','#FFF8EC']);}
    var v=$('#vflash');A(v,[{opacity:.95},{opacity:0}],{d:350,fill:'none'});
    if(panic){HOST.say('Panic snag! **'+G.you.name+'** grabbed the '+o.nm.toLowerCase()+'.',{brow:'down',hold:400});}
    var sl=$('#slot-you');if(sl){var src=$('#brk');flyTo(src,f,sl,{eyes:false});}
    CAM.enable(false);setTimeout(function(){GLOW.open(f);},panic?0:420);}
};
$('#shutter').addEventListener('click',function(){var b=$('#shutter');if(!CAM.on)return;b.classList.add('down');setTimeout(function(){b.classList.remove('down');},120);ac();
  var o=VF.lock;if(!o){SFX.bonk();hap(30);A($('#brk'),[{transform:'translateX(0)'},{transform:'translateX(-10px)'},{transform:'translateX(10px)'},{transform:'translateX(0)'}],{d:240,fill:'none'});var l=$('#olab');l.className='olab';l.textContent='Aim the brackets at a thing';return;}
  if(G.taken[o.id]){SFX.taken();hap([40,30,40]);A($('#brk'),[{transform:'scale(1)'},{transform:'scale(1.15)'},{transform:'scale(1)'}],{d:240,fill:'none'});return;}
  CAM.snag(o,false);});
$('#b-real').addEventListener('click',function(){if(!CAM.on)return;var fi=$('#realfile');fi.value='';fi.click();});
$('#realfile').addEventListener('change',function(e){var file=e.target.files&&e.target.files[0];if(!file||!CAM.on)return;
  var url=URL.createObjectURL(file),img=new Image();img.onload=function(){var c=document.createElement('canvas'),S=480;c.width=c.height=S;var x=c.getContext('2d'),m=Math.min(img.width,img.height);
    x.drawImage(img,(img.width-m)/2,(img.height-m)/2,m,m,0,0,S,S);URL.revokeObjectURL(url);var d=x.getImageData(S*.2,S*.2,S*.6,S*.6).data,P=G.cur.P;
    /* Pixel Judge on a real photo: 20th-percentile distance to the target colour, over the centre of the frame */
    var tgt=hex2rgb(P.kind==='color'?P.hex:'#808080'),tl=rgb2lab(tgt[0],tgt[1],tgt[2]),ds=[],sum=[0,0,0],cnt=0,all=[0,0,0];
    for(var i=0;i<d.length;i+=16){var l=rgb2lab(d[i],d[i+1],d[i+2]);ds.push([dE(l,tl),i]);all[0]+=d[i];all[1]+=d[i+1];all[2]+=d[i+2];}
    ds.sort(function(a,b){return a[0]-b[0];});var k=Math.max(1,Math.floor(ds.length*.2));for(var j=0;j<k;j++){var ii=ds[j][1];sum[0]+=d[ii];sum[1]+=d[ii+1];sum[2]+=d[ii+2];cnt++;}
    var col=P.kind==='color'?sum:all,n=P.kind==='color'?cnt:ds.length;var hex='#'+col.map(function(v){return Math.round(v/n).toString(16).padStart(2,'0');}).join('');
    var match=P.kind==='color'?clamp(Math.round(100-ds[k-1][0]*1.05),2,99):0;
    c.toBlob(function(blob){var u=URL.createObjectURL(blob);var f=newFind(G.you,null,{photo:u,blob:blob,col:hex,photoMatch:match,eyes:null,nm:'Your photo'});
      G.cur.onSnag(f);SFX.snagged();hap([20,30,40]);A($('#vflash'),[{opacity:.95},{opacity:0}],{d:350,fill:'none'});CAM.enable(false);var sl=$('#slot-you');if(sl)flyTo($('#brk'),f,sl,{eyes:false});GLOW.open(f);AI.read(f);},'image/jpeg',.85);};
  img.onerror=function(){showErr('That photo could not be opened. Try another one.');};img.src=url;});

/* ---------- glow-up ---------- */
var GLOW={f:null,eyes:[],
  open:function(f){GLOW.f=f;GLOW.eyes=[];phone('p-glow');var st=$('#gstage');$$('.stk',st).forEach(function(s){s.remove();});var s=sticker(f,{eyes:false});st.prepend(s);GLOW.stk=s;
    $('#ghint').hidden=false;$('#ghint').textContent='TAP TO STICK 2 EYES';popIn(s,{r0:-30});SFX.reveal();
    GLOW.names(f.obj?OBJI[f.obj].names.slice():shuffle(GEN_NAMES).slice(0,3));GLOW.brags(f.obj?OBJI[f.obj].brags.concat([pick(GEN_BRAGS)]):shuffle(GEN_BRAGS).slice(0,3));$('#aiwait').hidden=true;$('#b-send').disabled=false;},
  names:function(list){var w=$('#gnames');w.innerHTML='';GLOW.f.name=list[0];list.forEach(function(n,i){var b=h('<button class="chipb" role="radio" aria-checked="'+(i===0)+'">'+esc(n)+'</button>');b.addEventListener('click',function(){$$('.chipb',w).forEach(function(x){x.setAttribute('aria-checked','false');});b.setAttribute('aria-checked','true');GLOW.f.name=n;SFX.sel();hap(5);});w.appendChild(b);});
    var d=h('<button class="chipb dicey" aria-label="Roll new names"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r="1.4" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/></svg>Roll</button>');
    d.addEventListener('click',function(){SFX.boing();var base=GLOW.f.obj?OBJI[GLOW.f.obj].nm.split(' ').pop():pick(['Thing','Gizmo','Whatsit','Doodad']);base=base.charAt(0).toUpperCase()+base.slice(1);
      GLOW.names([pick(PRE)+' '+base,base+' '+pick(['Supreme','the Great','Jr.','Deluxe','Prime']),pick(PRE)+' '+pick(['Wiggles','Sparkles','McFancy','Bonanza','Thunder'])]);});w.appendChild(d);},
  brags:function(list){var w=$('#gbrags');w.innerHTML='';GLOW.f.brag=list[0];list.forEach(function(n,i){var b=h('<button role="radio" aria-checked="'+(i===0)+'"><i></i><span>'+esc(n)+'</span></button>');b.addEventListener('click',function(){$$('button',w).forEach(function(x){x.setAttribute('aria-checked','false');});b.setAttribute('aria-checked','true');GLOW.f.brag=n;SFX.sel();hap(5);});w.appendChild(b);});},
  tap:function(e){if(!GLOW.f||CURP!=='p-glow')return;var r=GLOW.stk.getBoundingClientRect();var x=(e.clientX-r.left)/r.width*120,y=(e.clientY-r.top)/r.height*120;if(x<0||y<0||x>120||y>120)return;
    if(GLOW.eyes.length>=2){GLOW.eyes=[];$$('.gg',GLOW.stk).forEach(function(g){g.remove();});}
    GLOW.eyes.push([Math.round(x),Math.round(y)]);var rr=GLOW.f.obj?OBJI[GLOW.f.obj].eyes[2]:11;addEyes(GLOW.stk,[[x,y],null,rr]);SFX.boing();hap(12);var g=GLOW.stk.lastChild;A(g,[{transform:'scale(0)'},{transform:'scale(1)'}],{sp:'wobble'});kickEyes(GLOW.stk,8);
    if(GLOW.eyes.length===2){$('#ghint').textContent='TAP AGAIN TO RE-STICK';SFX.sparkle();PFX.at(GLOW.stk,26);A(GLOW.stk,[{transform:'scale(1)'},{transform:'scale(1.08) rotate(-4deg)'},{transform:'scale(1)'}],{sp:'wobble',fill:'none'});}else $('#ghint').textContent='ONE MORE EYE';},
  send:async function(auto){if(G.sent||!GLOW.f)return;G.sent=true;var f=GLOW.f;
    f.eyes=GLOW.eyes.length===2?[GLOW.eyes[0],GLOW.eyes[1],f.obj?OBJI[f.obj].eyes[2]:11]:(f.obj?OBJI[f.obj].eyes:[[42,46],[78,46],11]);
    $('#b-send').disabled=true;var sl=$('#slot-you');hap([10,20,10]);
    if(sl&&curScene==='hunt'){await flyTo(GLOW.stk,f,sl,{});slotState(G.you,'','ready');SFX.stamp();}
    waitScreen(auto?'Auto-sent! Watch the TV.':'Sent! Watch the TV.');}
};
$('#gstage').addEventListener('click',GLOW.tap);
$('#b-send').addEventListener('click',function(){press($('#b-send'));GLOW.send(false);});
function waitScreen(msg,sub){var f=GLOW.f;phone('p-wait');wrank();var c=$('#w-card');c.innerHTML='';if(f){var s=sticker(f);c.appendChild(s);c.appendChild(h('<div><div class="wn">'+esc(f.name)+'</div><div class="wb">'+esc(f.brag)+'</div></div>'));}setStat(msg,sub);}
function setStat(msg,sub){$('#w-stat').innerHTML=esc(msg)+(sub?'<small>'+esc(sub)+'</small>':'');A($('#w-stat'),[{transform:'scale(.9)',opacity:.4},{transform:'scale(1)',opacity:1}],{sp:'pop'});}

/* ---------- optional: Claude reads a real photo (the page asks permission first) ---------- */
var AI={s:null,img:false,ready:false,
  init:function(){if(!window.claude||!claude.use)return;claude.use('sample').then(function(s){if(!s)return;AI.s=s;return s.limits().then(function(l){AI.img=!!(l&&l.images);});}).catch(function(){});},
  read:function(f){if(!AI.s||!AI.img||!f.blob)return;var P=G.cur.P,pp=promptParts(P);$('#aiwait').hidden=false;
    var q='You are Sir Socksworth, the posh sock-puppet host of a family party game called Snag & Brag. A player photographed something in their home for this round. The round prompt is: "'+pp.a+' '+pp.b+' '+pp.c+'". Look at the photo. Reply with only JSON in this shape: {"thing":"plain name of the object, 1-4 words","names":["three funny stage names for it, each under 18 characters"],"brags":["two short funny brag lines about it, each under 60 characters"],"score":0,"quip":"one witty host line reacting to it, under 80 characters"}. score is an integer 0-10 for how well it fits the prompt. Keep everything family friendly.';
    AI.s.json(q,{images:f.blob,modelTier:'quick'}).then(function(j){$('#aiwait').hidden=true;if(!j||typeof j!=='object')return;f.ai={score:clamp(+j.score||5,0,10),quip:String(j.quip||'').slice(0,90)};if(j.thing)f.nm=String(j.thing).slice(0,30);
      if(!G.sent&&GLOW.f===f){if(Array.isArray(j.names)&&j.names.length)GLOW.names(j.names.slice(0,3).map(function(n){return String(n).slice(0,22);}));if(Array.isArray(j.brags)&&j.brags.length)GLOW.brags(j.brags.slice(0,2).map(function(n){return String(n).slice(0,70);}).concat([pick(GEN_BRAGS)]));SFX.sparkle();}})
    .catch(function(){$('#aiwait').hidden=true;});}};

/* ---------- REVEAL 1: the Pixel Judge ---------- */
function pixScan(cv,col){if(!cv)return;var x=cv.getContext('2d'),c=hex2rgb(col),iv=setInterval(function(){for(var a=0;a<10;a++)for(var b=0;b<10;b++){var j=rnd(-70,70);x.fillStyle='rgb('+clamp(c[0]+j,0,255)+','+clamp(c[1]+j,0,255)+','+clamp(c[2]+j,0,255)+')';x.fillRect(a,b,1,1);}},60);
  A(cv,[{opacity:0},{opacity:.95,offset:.15},{opacity:.95,offset:.7},{opacity:0}],{d:900});setTimeout(function(){clearInterval(iv);},950);}
async function judgeFlow(){var P=G.cur.P,F=G.teams.map(function(t){return G.cur.finds[t.id];}).sort(function(a,b){return a.order-b.order;});
  await scene('judge',{build:function(){var s=$('#sc-judge');s.innerHTML='<div class="L jhead"><span class="pillk k">The Pixel Judge</span><span class="pillk p" style="gap:10px">TARGET <span style="width:30px;height:30px;border-radius:50%;border:4px solid #0E0B2B;background:'+P.hex+'"></span> '+P.k+'</span></div>';
    F.forEach(function(f,i){var t=team(f.team);var c=h('<div class="jcard" id="jc-'+t.id+'" style="left:'+(48+i*304)+'px"><div class="jin"><div class="jb cardback" style="--c:'+t.color+'"><div class="q">?</div></div><div class="jf"><div class="jart"></div><div class="jn">'+esc(f.name)+'</div><div class="jo">'+esc(f.nm)+'</div><div class="jm"><span class="sw2" style="background:'+f.col+'"></span><span class="bar"><i></i></span><span class="pc">0%</span></div><div class="scanbeam"></div></div></div><div class="sh"><div class="pillk p" style="font-size:13px;padding:4px 10px 5px 4px;letter-spacing:1px;box-shadow:0 4px 0 #0E0B2B;border-width:4px">'+badge(t)+esc(t.name)+'</div></div></div>');
      c.querySelector('.jart').appendChild(sticker(f));var pxc=document.createElement('canvas');pxc.className='pix';pxc.width=pxc.height=10;c.querySelector('.jart').appendChild(pxc);c.querySelector('.sh .badge').style.cssText+=';width:26px;height:26px;font-size:11px;border-width:3px';s.appendChild(c);});}});
  CROWD_ON=true;waitScreen('The Pixel Judge is scanning…','Send reactions while you wait');
  await HOST.say('The Pixel Judge sees every pixel. Let us see who is really **'+P.k.toLowerCase()+'**.',{hold:500});
  for(var i=0;i<F.length;i++){var f=F[i],t=team(f.team),c=$('#jc-'+t.id);
    var m=f.photo?f.photoMatch:clamp(colorMatch(f.col,P.hex)+ri(-3,2),2,99);f.match=m;var bonus=[30,20,10,0][f.order-1]||0;f.pts=m+bonus;
    SFX.flip();A(c.querySelector('.jin'),[{transform:'rotateY(0) scale(1)'},{transform:'rotateY(90deg) scale(1.08)',offset:.5},{transform:'rotateY(180deg) scale(1)'}],{d:620,e:'cubic-bezier(.4,0,.2,1)'});
    setTimeout(function(cc){kickEyes(cc,14);}.bind(null,c),400);await sleep(560);
    var beam=c.querySelector('.scanbeam');SFX.scan();A(beam,[{opacity:0,top:'30px'},{opacity:1,top:'40px',offset:.1},{opacity:1,top:'200px',offset:.9},{opacity:0,top:'210px'}],{d:800,e:'ease-in-out'});pixScan(c.querySelector('.pix'),f.col);await sleep(820);
    var bar=c.querySelector('.bar i'),pc=c.querySelector('.pc');A(bar,[{width:'0%'},{width:m+'%'}],{d:800,e:'cubic-bezier(.2,.8,.3,1)'});A(c.querySelector('.sw2'),[{transform:'scale(0)'},{transform:'scale(1)'}],{sp:'wobble'});
    await new Promise(function(res){var t0=performance.now();(function g(n){var k=Math.min(1,(n-t0)/800),v=Math.round(m*(1-Math.pow(1-k,3)));pc.textContent=v+'%';if(Math.random()<.5)SFX.mtick(k);if(k<1)requestAnimationFrame(g);else res();})(t0);});
    var p=tvPt(c);shake(5);if(m>=90)HOST.react('glee',900);else if(m<55)HOST.react('shock',900);
    if(bonus){c.querySelector('.jo').innerHTML=esc(f.nm)+' · <span style="color:#8B5CFF">+'+bonus+' speed</span>';}
    FX.confetti(p.x,p.y-40,24,{cols:[t.color,'#FFD43B','#FFF8EC'],pow:600});flyPts(t,f.pts,{x:p.x,y:p.y-30});
    if(t.you){setStat(m+'% '+P.k.toLowerCase(),'+'+f.pts+' points'+(bonus?' including '+bonus+' for speed':''));if(f.ai&&f.ai.quip)HOST.say(f.ai.quip,{hold:400});}
    await sleep(420);}
  var win=F.slice().sort(function(a,b){return b.pts-a.pts;})[0],wt=team(win.team),wc=$('#jc-'+wt.id);
  MUS.set('brag');BG.set('party');var jh=$('#sc-judge .jhead');jh.innerHTML='<span class="pillk y" style="font-size:22px">Most '+P.k.toLowerCase()+': '+esc(win.name)+'</span>';slam(jh.firstChild,{rot:-2,sh:10});
  var cr=h('<svg class="L" viewBox="0 0 40 30" style="left:'+(parseInt(wc.style.left)+196)+'px;top:136px;width:96px;height:72px;z-index:9"><path d="M3 27L5 6L14 16L20 2L26 16L35 6L37 27Z" fill="#FFD43B" stroke="#0E0B2B" stroke-width="2.6" stroke-linejoin="round"/><circle cx="20" cy="20" r="2.6" fill="#FF4FA0" stroke="#0E0B2B" stroke-width="1.4"/></svg>');$('#sc-judge').appendChild(cr);slam(cr,{rot:16,sh:6,ring:false});
  A(wc,[{transform:'scale(1)'},{transform:'scale(1.06) rotate(-2deg)'}],{sp:'wobble'});FX.confetti(tvPt(wc).x,300,120,{pow:1200});SFX.fanfare();HOST.react('glee',1600);
  await HOST.say('**'+wt.name+'** wins Color Rush with **'+win.name+'**!',{brow:'up',hold:1200});CROWD_ON=false;
}

/* ---------- REVEAL 2: the Brag-Off ---------- */
var MASH=null;
async function bragFlow(){var P=G.cur.P,F=G.cur.finds,ids=G.teams.map(function(t){return t.id;});var foe=pick(ids.slice(1)),rest=ids.slice(1).filter(function(x){return x!==foe;});
  var matches=[{l:'you',r:foe,k:'SEMI-FINAL 1 OF 2',pts:100},{l:rest[0],r:rest[1],k:'SEMI-FINAL 2 OF 2',pts:100}],winners=[];
  for(var i=0;i<matches.length;i++){winners.push(await faceOff(matches[i],P,F));}
  await faceOff({l:winners[0],r:winners[1],k:'THE FINAL',pts:150,final:true},P,F);
}
async function faceOff(M,P,F){var L=F[M.l],R=F[M.r],tl=team(M.l),tr=team(M.r),youSide=M.l==='you'?-1:M.r==='you'?1:0;
  var SEAM='M716 -10L668 200L706 214L612 430L652 444L560 730';
  await scene('brag',{build:function(){var s=$('#sc-brag');s.style.setProperty('--sx','0%');
    s.innerHTML='<div class="bpan l" id="bp-l" style="--c:'+tl.color+'"></div><div class="bpan r" id="bp-r" style="--c:'+tr.color+'"></div>'
    +'<svg class="L bseam" id="b-seam" viewBox="0 0 1280 720" aria-hidden="true"><path d="'+SEAM+'" fill="none" stroke="#0E0B2B" stroke-width="28" stroke-linejoin="round"/><path d="'+SEAM+'" fill="none" stroke="#FFF8EC" stroke-width="12" stroke-linejoin="round"/></svg>'
    +'<div class="L bk"><span class="pillk '+(M.final?'y':'k')+'">'+M.k+'</span></div>'
    +'<div class="bside l" id="bs-l"><div class="bart"></div><div class="bnm">'+esc(L.name)+'</div><div class="btm">'+badge(tl)+esc(tl.name)+'</div></div>'
    +'<div class="bside r" id="bs-r"><div class="bart"></div><div class="bnm">'+esc(R.name)+'</div><div class="btm">'+badge(tr)+esc(tr.name)+'</div></div>'
    +'<div class="L vsb" id="b-vs">VS</div><div class="bline l" id="bl-l">'+esc(L.brag)+'</div><div class="bline r" id="bl-r">'+esc(R.brag)+'</div>'
    +'<div class="L tug" id="tug" style="--cl:'+tl.color+';--cr:'+tr.color+'">'+badge(tl,'tb l')+'<div class="tt" id="tug-t"><div class="tl" id="tug-l"></div><div class="tm"></div></div><div class="tk" id="tug-k"><svg viewBox="0 0 24 24"><use href="#i-star"/></svg></div>'+badge(tr,'tb r')+'</div>'
    +'<div class="L combo" id="combo" style="left:'+(youSide<0?266:youSide>0?1014:640)+'px"></div><div class="L mashcall mega" id="mcall"></div><div class="L bko mega" id="bko">BRAGGED!</div>';
    var a=$('#bs-l .bart'),b=$('#bs-r .bart');a.replaceWith(Object.assign(sticker(L),{className:'bart stk'}));b.replaceWith(Object.assign(sticker(R),{className:'bart stk'}));}});
  MUS.set('brag');BG.set('normal');var s=$('#sc-brag'),bl=$('#bs-l'),br=$('#bs-r'),seam=$('#b-seam'),vs=$('#b-vs');
  A($('#bp-l'),[{transform:'translateX(-105%)'},{transform:'none'}],{d:560,e:'cubic-bezier(.2,.9,.3,1)'});A($('#bp-r'),[{transform:'translateX(105%)'},{transform:'none'}],{d:560,e:'cubic-bezier(.2,.9,.3,1)',delay:60});SFX.whoosh();
  A(seam,[{opacity:0,transform:'scaleY(0)'},{opacity:1,transform:'none'}],{d:260,delay:480,e:'cubic-bezier(.2,.9,.3,1)',fill:'backwards'});
  A(bl,[{transform:'translateX(-700px) rotate(-30deg)'},{transform:'none'}],{sp:'drop',fill:'backwards',delay:240});A(br,[{transform:'translateX(700px) rotate(30deg)'},{transform:'none'}],{sp:'drop',delay:340,fill:'backwards'});
  await sleep(680);SFX.slam();shake(14);flash(.35);kickEyes(null,12);A(vs,[{opacity:0,transform:'scale(3) rotate(-180deg)'},{opacity:1,transform:'scale(1) rotate(-8deg)'}],{sp:'pop'});
  phoneMash(M,L,R,tl,tr);
  await HOST.say(M.final?'The final! **'+L.name+'** versus **'+R.name+'**!':'In this corner, **'+L.name+'**! And in that corner, **'+R.name+'**!',{brow:'up',hold:250});HOST.hide();
  popIn($('#bl-l'),{r0:-14,r:-2});for(var k=0;k<6;k++)setTimeout(SFX.voice,k*70);kickEyes(bl,10);A(bl,[{transform:'none'},{transform:'translateY(-16px) rotate(-3deg)'},{transform:'none'}],{d:360,fill:'none'});await sleep(1500);
  popIn($('#bl-r'),{r0:14,r:2});for(k=0;k<6;k++)setTimeout(SFX.voice,k*70);kickEyes(br,10);A(br,[{transform:'none'},{transform:'translateY(-16px) rotate(3deg)'},{transform:'none'}],{d:360,fill:'none'});await sleep(1600);
  A($('#bl-l'),[{opacity:1},{opacity:0}],{d:200});A($('#bl-r'),[{opacity:1},{opacity:0}],{d:200});
  var tug=$('#tug');A(tug,[{opacity:0,transform:'translateY(60px)'},{opacity:1,transform:'none'}],{sp:'pop'});var mc=$('#mcall');
  for(var n=3;n>=1;n--){mc.textContent=n;SFX.beep(0);A(mc,[{opacity:0,transform:'scale(2)'},{opacity:1,transform:'scale(1)',offset:.4},{opacity:0,transform:'scale(.8)'}],{d:560});await sleep(560);}
  mc.textContent='MASH!';mc.style.color='#FF4FA0';SFX.horn();flash(.5);shake(12);A(mc,[{opacity:0,transform:'scale(2.4) rotate(-8deg)'},{opacity:1,transform:'scale(1) rotate(-4deg)',offset:.3},{opacity:0,transform:'scale(1.3)'}],{d:900});
  var p=0,tL=traitOf(L,P),tR=traitOf(R,P);
  var botRate={};[M.l,M.r].forEach(function(id){if(id!=='you')botRate[id]=clamp(.1+(traitOf(F[id],P)-5)*.014+rnd(-.02,.02),.04,.17);});
  var voters=G.teams.filter(function(t){return !t.you&&t.id!==M.l&&t.id!==M.r;}).map(function(t){return {id:t.id,side:(tL+rnd(-3,3))>(tR+rnd(-3,3))?-1:1};});
  var combo=$('#combo'),cn=0;MASH.onTap=function(){cn++;combo.textContent='x'+cn;A(combo,[{opacity:1,transform:'translateX(-50%) scale(1.6) rotate(-10deg)'},{opacity:1,transform:'translateX(-50%) scale(1) rotate(-4deg)'}],{d:180});if(cn%10===0){var q=tvPt(combo);FX.stars(q.x,q.y,10,'#FFD43B');SFX.sparkle();}};
  MASH.on=true;MASH.taps=0;MASH.pending=0;$('#p-mash').classList.add('mashing');var tk=$('#tug-k'),tlf=$('#tug-l'),tt=$('#tug-t'),TW=tt.offsetWidth,TL=tt.offsetLeft,last=performance.now(),crowdT=0,lastBotTap=0;
  await phase(6000,function(el){var now=performance.now(),dt=Math.min(.1,(now-last)/1000);last=now;
    var f=MASH.pending||0;MASH.pending=0;p+=f;
    [M.l,M.r].forEach(function(id,j){if(botRate[id]){p+=(j===0?-1:1)*botRate[id]*dt*rnd(.6,1.4);}});
    voters.forEach(function(v){p+=v.side*.025*dt;});
    p=clamp(p,-1,1);MASH.p=p;var w=50+p*-50;tlf.style.width=w+'%';tk.style.left=(TL+TW*w/100).toFixed(1)+'px';
    s.style.setProperty('--sx',(-p*16).toFixed(2)+'%');seam.style.transform='translateX('+(-p*16*12.8).toFixed(1)+'px)';
    bl.style.transform='scale('+(1-p*.14).toFixed(3)+')';br.style.transform='scale('+(1+p*.14).toFixed(3)+')';
    if(now-lastBotTap>140){lastBotTap=now;var pt=tvPt(tk);FX.P.push({k:'star',x:pt.x+rnd(-30,30),y:pt.y,vx:rnd(-200,200),vy:rnd(-400,-200),g:900,dr:.98,r:0,vr:rnd(-8,8),w:rnd(10,18),h:0,c:pick([tl.color,tr.color]),life:.7,t:0});}
    crowdT+=dt;if(crowdT>.6){crowdT=0;SFX.crowd(.6,.04+Math.abs(p)*.08);}
    MASH.mphone&&MASH.mphone(p);return false;});
  MASH.on=false;MASH.onTap=null;$('#p-mash').classList.remove('mashing');
  var lw=p<0||(p===0&&tL>=tR),W=lw?L:R,Lo=lw?R:L,wt=team(W.team),wEl=lw?bl:br,lEl=lw?br:bl;
  A(tug,[{opacity:1},{opacity:0}],{d:250});A(combo,[{opacity:1},{opacity:0}],{d:250});A(vs,[{opacity:1,transform:'scale(1) rotate(-8deg)'},{opacity:0,transform:'scale(2.2) rotate(20deg)'}],{d:300});
  SFX.ko();shake(22);flash(.7);punch(1.07);HOST.react('glee',1800);
  var sx0=-p*16,sx1=lw?78:-78;
  A(lEl,[{transform:lEl.style.transform||'none',opacity:1},{transform:'translate('+(lw?760:-760)+'px,-260px) rotate('+(lw?620:-620)+'deg) scale(.4)',opacity:0}],{d:850,e:'cubic-bezier(.5,0,.75,.4)'});setTimeout(SFX.boing,120);
  A(wEl,[{transform:wEl.style.transform||'none'},{transform:'translateX('+(lw?374:-374)+'px) scale(1.12)'}],{sp:'soft'});
  await new Promise(function(res){var t0=performance.now();(function f(n){var k=Math.min(1,(n-t0)/560),e=1-Math.pow(1-k,3),v=sx0+(sx1-sx0)*e;s.style.setProperty('--sx',v.toFixed(2)+'%');seam.style.transform='translateX('+(v*12.8).toFixed(1)+'px)';if(k<1)requestAnimationFrame(f);else res();})(t0);});
  kickEyes(wEl,16);var ko=$('#bko');slam(ko,{rot:-5,sh:12});
  FX.confetti(640,300,120,{cols:[wt.color,'#FFD43B','#FFF8EC','#FF4FA0'],pow:1300});SFX.fanfare();W.pts+=M.pts;flyPts(wt,M.pts,{x:640,y:290},{delay:350});
  if(youSide){mashResult(W.team==='you'?'You won the brag!':'So close. They bragged harder.',W.team==='you'?'+'+M.pts+' points':'Keep your thumbs warm');if(W.team==='you')PFX.burst(60,[G.you.color,'#FFD43B','#FFF8EC']);}else mashResult(wt.name+' wins this one','You had '+(MASH.taps)+' taps in it');
  await HOST.say(pick(['**'+W.name+'** brags harder!','The room has spoken: **'+W.name+'**!','**'+W.name+'** takes it. '+Lo.name+' is devastated.']),{brow:'up',hold:900});
  return W.team;}
function phoneMash(M,L,R,tl,tr){phone('p-mash');var g=$('#mgrid');g.innerHTML='';$('#m-k').textContent=M.k;var youIn=M.l==='you'||M.r==='you';
  $('#m-h').innerHTML=youIn?'Mash <em>your</em> sticker':'Pick a side and <em>mash</em>';$('#m-s').textContent='Get ready…';
  [[L,tl,-1],[R,tr,1]].forEach(function(q){var f=q[0],t=q[1],side=q[2];var b=h('<button class="mbtn" style="background:'+t.color+'"><span class="tap">0</span><em>MASH</em></button>');var s=sticker(f);b.appendChild(s);b.appendChild(h('<b>'+esc(f.name)+'</b>'));b.appendChild(h('<small>'+esc(t.name)+'</small>'));
    if(youIn&&f.team!=='you')b.disabled=true;var n=0;
    b.addEventListener('pointerdown',function(e){e.preventDefault();if(!MASH||!MASH.on)return;n++;MASH.taps++;MASH.pending=(MASH.pending||0)+side*.065;b.querySelector('.tap').textContent=n;b.classList.add('hit');setTimeout(function(){b.classList.remove('hit');},60);SFX.mash(n);hap(8);kickEyes(s,6);if(MASH.onTap)MASH.onTap(n);
      if(n%3===0){var tk=$('#tug-k');if(tk){var p=tvPt(tk);FX.stars(p.x,p.y,4,t.color);}}});
    b.addEventListener('keydown',function(e){if(e.key===' '||e.key==='Enter'){e.preventDefault();b.dispatchEvent(new PointerEvent('pointerdown'));}});
    g.appendChild(b);});
  MASH={on:false,taps:0,mphone:function(p){var s=$('#m-s');s.textContent=Math.abs(p)<.08?'Dead even!':((p<0)===(true)?L.name:R.name)+' is pulling ahead';}};}
function mashResult(a,b){if(CURP!=='p-mash')return;$('#m-h').textContent=a;$('#m-s').textContent=b;}

/* ---------- REVEAL 3: the Showstopper ---------- */
async function showFlow(){var P=G.cur.P,F=G.cur.finds,order=G.teams.map(function(t){return F[t.id];});
  await scene('show',{build:function(){var s=$('#sc-show');s.innerHTML='<div class="L bk"><span class="pillk y">Double points</span></div>';
    order.forEach(function(f,i){var t=team(f.team);var p=h('<div class="ped" id="pd-'+t.id+'" style="left:'+(48+i*304)+'px;--c:'+t.color+'"><div class="spotc" style="left:-14px"></div><div class="part"></div><div class="pb"><div class="pn">'+esc(f.name)+'</div><div class="po">'+badge(t)+esc(t.name)+'</div><div class="pbl">'+esc(f.brag)+'</div><div class="pv"></div></div></div>');
      var st=sticker(f);st.style.cssText='width:100%;height:100%;opacity:0';p.querySelector('.part').appendChild(st);s.appendChild(p);});}});
  MUS.set('tension');BG.set('tension');CROWD_ON=true;waitScreen('The runway is open','Vote is coming up next');
  HOST.say('Welcome to the runway. Tonight\'s finds, please!',{hold:200});
  for(var i=0;i<order.length;i++){var f=order[i],t=team(f.team),pd=$('#pd-'+t.id),st=pd.querySelector('.stk'),sc=pd.querySelector('.spotc');
    A(sc,[{opacity:0},{opacity:1}],{d:250});SFX.thump();A(st,[{opacity:0,transform:'translateY(-500px) rotate(-30deg)'},{opacity:1,transform:'translateY(0) rotate(0)'}],{sp:'drop'});
    setTimeout(function(e){SFX.stamp();shake(7);kickEyes(e,14);FX.ring(tvPt(e).x,tvPt(e).y+90,'#FFF8EC',150);}.bind(null,st),330);await sleep(900);A(sc,[{opacity:1},{opacity:.25}],{d:500});}
  /* vote */
  MUS.set('brag');BG.set('party');
  var vt=h('<div class="L vtimer"><span class="pillk pk">VOTE NOW</span><span class="pillk p" id="vt-n" style="font-family:var(--disp);font-size:30px;letter-spacing:0;padding:2px 14px">10</span></div>');$('#sc-show').appendChild(vt);popIn(vt);
  HOST.say('Vote for the best find. Not your own. I am watching. I have no eyes, but **I am watching**.',{hold:300});
  phoneVote(order);var bots=G.teams.filter(function(t){return !t.you;}).map(function(t){return {t:t,at:rnd(1.5,7.5),done:false};});G.votes={};
  await phase(10000,function(el,ms){$('#vt-n').textContent=Math.ceil((ms-el)/1000);
    bots.forEach(function(b){if(!b.done&&el/1000>=b.at){b.done=true;var opts=order.filter(function(f){return f.team!==b.t.id;}).map(function(f){return {f:f,s:traitOf(f,P)+rnd(0,6)};});opts.sort(function(a,c){return c.s-a.s;});castVote(b.t,opts[0].f);}});
    return Object.keys(G.votes).length>=G.teams.length;});
  if(!G.votes.you){var o=order.filter(function(f){return f.team!=='you';});castVote(G.you,pick(o));}
  vt.remove();await sleep(500);
  /* tally */
  MUS.set('tension');SFX.drumroll(1.4);await sleep(1400);
  var max=0;order.forEach(function(f){max=Math.max(max,f.votes);});var tops=order.filter(function(f){return f.votes===max;});tops.sort(function(a,b){return traitOf(b,P)-traitOf(a,P);});var W=tops[0];
  order.forEach(function(f,i){var t=team(f.team),pts=f.votes*100+(f===W?100:0);f.pts+=pts;if(pts){flyPts(t,pts,tvPt($('#pd-'+t.id+' .part')),{delay:i*170});}});
  var wt=team(W.team),wp=$('#pd-'+wt.id);MUS.set('win');BG.set('gold');SFX.fanfare();SFX.sparkle();flash(.7);shake(16);punch(1.06);
  wp.querySelector('.part .stk').classList.add('holostk');HOST.react('glee',2000);var cw=h('<svg class="L pcrown" viewBox="0 0 40 30" style="left:'+(parseInt(wp.style.left)+92)+'px"><path d="M3 27L5 6L14 16L20 2L26 16L35 6L37 27Z" fill="#FFD43B" stroke="#0E0B2B" stroke-width="2.6" stroke-linejoin="round"/><circle cx="20" cy="20" r="2.6" fill="#FF4FA0" stroke="#0E0B2B" stroke-width="1.4"/></svg>');$('#sc-show').appendChild(cw);A(cw,[{opacity:0,transform:'translateY(-260px) rotate(-30deg)'},{opacity:1,transform:'rotate(-8deg)'}],{sp:'drop',delay:250});setTimeout(function(){SFX.stamp();},560);A(wp,[{transform:'scale(1)'},{transform:'scale(1.1) translateY(-10px)'}],{sp:'wobble'});kickEyes(wp,18);
  var rb=h('<div class="ribbon" style="left:'+(parseInt(wp.style.left)+30)+'px;top:268px;font-size:24px;background:#FFD43B;color:#0E0B2B;transform:rotate(-6deg);z-index:12">SHOWSTOPPER</div>');$('#sc-show').appendChild(rb);slam(rb,{rot:-6});
  for(var c=0;c<3;c++)setTimeout(function(){FX.confetti(tvPt(wp).x,300,90,{pow:1300});},c*350);
  setStat(W.team==='you'?'Your find stole the show!':wt.name+' stole the show',G.cur.finds.you.votes+' vote'+(G.cur.finds.you.votes===1?'':'s')+' for you · '+(G.cur.finds.you.votes*100+(W.team==='you'?100:0))+' points');phone('p-wait');
  await HOST.say('By '+max+' vote'+(max===1?'':'s')+': **'+W.name+'**! It is going holographic.',{brow:'up',hold:1400});CROWD_ON=false;
}
function castVote(voter,f){if(G.votes[voter.id])return;G.votes[voter.id]=f.team;f.votes++;var pv=$('#pd-'+f.team+' .pv');if(!pv)return;var b=h(badge(voter));b.style.visibility='hidden';pv.appendChild(b);var chip=$('#chip-'+voter.id);
  var land=function(){b.style.visibility='';slam(b,{from:2.2,sh:5,ring:false,d:360});SFX.stamp();var q=tvPt(b);FX.stars(q.x,q.y,6,voter.color);};
  if(chip&&!RM){SFX.whoop();flyEl('<span class="badge'+(DARK[voter.color]?' lt':'')+'" style="--c:'+voter.color+';width:56px;height:56px;font-size:20px">'+esc(voter.mono)+'</span>',tvPt(chip),tvPt(b),{d:640,arc:170,sm:1.7,s1:.6}).then(land);}else land();
  if(voter.you)PFX.burst(24,[team(f.team).color,'#FFD43B']);}
function phoneVote(order){phone('p-vote');var l=$('#vlist');l.innerHTML='';$('#v-stat').textContent='';
  order.filter(function(f){return f.team!=='you';}).forEach(function(f){var t=team(f.team);var b=h('<button class="vopt" role="radio" aria-checked="false"><div></div><div><b>'+esc(f.name)+'</b><small>'+esc(f.brag)+'</small><div class="who">'+esc(t.name)+'</div></div><i></i></button>');b.firstChild.replaceWith(sticker(f));
    b.addEventListener('click',function(){if(G.votes.you)return;b.setAttribute('aria-checked','true');$$('.vopt',l).forEach(function(x){if(x!==b)x.disabled=true;});SFX.sel();hap(15);castVote(G.you,f);$('#v-stat').textContent='Vote locked in for '+f.name;});l.appendChild(b);});}

/* ---------- standings ---------- */
var PREV_RANK=null;
async function standFlow(r,before){var T=G.teams.slice().sort(function(a,b){return b.score-a.score;}),prev=PREV_RANK||G.teams.map(function(t){return t.id;}),max=Math.max(1,T[0].score)*1.04,LH=78;
  function pct(v){return clamp(v/max*100,5,95);}
  await scene('stand',{build:function(){var s=$('#sc-stand');s.innerHTML='<div class="L sthead"><div class="mega st-t" id="st-t">STANDINGS</div><span class="pillk k" id="st-k">After round '+(r+1)+' of 3</span></div><div class="L lanes" id="lanes"></div>';
    var LN=$('#lanes');prev.forEach(function(id,i){var t=team(id),b0=before[t.id]||0;LN.appendChild(h('<div class="lane'+(t.you?' you':'')+'" id="ln-'+t.id+'" style="top:'+(i*LH)+'px;--c:'+t.color+'"><span class="lrk">'+(i+1)+'</span><span class="lnm">'+esc(t.name)+(t.you?'<small>You</small>':'')+'</span><div class="ltrack"><div class="lfill" style="width:'+pct(b0)+'%"></div><div class="lrider" style="left:'+pct(b0)+'%">'+badge(t)+'</div></div><span class="lsc">'+b0+'</span>'+(t.score>b0?'<span class="ldel">+'+(t.score-b0)+'</span>':'')+'</div>'));});}});
  MUS.set('lobby');BG.set('normal');
  slam($('#st-t'),{rot:-2,sh:8});popIn($('#st-k'),{r:2,delay:200});
  prev.forEach(function(id,i){A($('#ln-'+id),[{transform:'translateX(-1400px)'},{transform:'none'}],{sp:'soft',delay:150+i*90,fill:'backwards'});});
  await sleep(950);SFX.riser(1.2);
  T.forEach(function(t){var ln=$('#ln-'+t.id),b0=before[t.id]||0,w0=pct(b0),w1=pct(t.score),E='cubic-bezier(.3,.8,.3,1)';
    A(ln.querySelector('.lfill'),[{width:w0+'%'},{width:w1+'%'}],{d:1300,e:E});A(ln.querySelector('.lrider'),[{left:w0+'%'},{left:w1+'%'}],{d:1300,e:E});rollNum(ln.querySelector('.lsc'),b0,t.score,1300);
    if(t.score>b0){A(ln.querySelector('.lrider .badge'),[{transform:'translateY(0) rotate(0)'},{transform:'translateY(-12px) rotate(-8deg)'},{transform:'translateY(0) rotate(0)'}],{d:220,it:6,fill:'none'});var d=ln.querySelector('.ldel');if(d)A(d,[{opacity:0,transform:'scale(.3)'},{opacity:1,transform:'scale(1) rotate(-6deg)'}],{sp:'pop',delay:1200});}});
  await sleep(1550);
  var moved=false;T.forEach(function(t,i){var ln=$('#ln-'+t.id),pi=prev.indexOf(t.id);ln.querySelector('.lrk').textContent=i+1;if(pi!==i){moved=true;A(ln,[{top:(pi*LH)+'px'},{top:(i*LH)+'px'}],{sp:'soft'});if(i<pi){var ot=h('<span class="otk">Overtake!</span>');ln.appendChild(ot);slam(ot,{rot:-5,sh:5,ring:false,from:2.2,delay:250});}}});
  if(moved){SFX.whoosh();setTimeout(SFX.stamp,320);}
  var lead=$('#ln-'+T[0].id);setTimeout(function(){if(!lead.isConnected)return;lead.classList.add('lead');var q=tvPt(lead.querySelector('.lrider'));FX.confetti(q.x,q.y,40,{cols:[T[0].color,'#FFD43B','#FFF8EC'],pow:700});SFX.coin();},moved?520:120);
  PREV_RANK=T.map(function(t){return t.id;});
  var yr=T.indexOf(G.you)+1;phone('p-wait');setStat('You are '+yr+['st','nd','rd','th'][Math.min(3,yr-1)],G.you.score+' points so far');
  if(T[0].you)HOST.react('glee',1500);
  await HOST.say(T[0].you?'**You** lead the pack! Do not get cocky. Get a little cocky.':'**'+T[0].name+'** leads. '+(yr===4?'Somebody has to be last. Today it is you.':'It is still anyone\'s game.'),{hold:1200});
}

/* ---------- champion ---------- */
var CROWN='<svg viewBox="0 0 40 30" aria-hidden="true"><path d="M3 27L5 6L14 16L20 2L26 16L35 6L37 27Z" fill="#FFD43B" stroke="#0E0B2B" stroke-width="2.4" stroke-linejoin="round"/><circle cx="20" cy="20" r="2.6" fill="#FF4FA0" stroke="#0E0B2B" stroke-width="1.3"/><circle cx="10" cy="22" r="1.8" fill="#3FE0D0" stroke="#0E0B2B" stroke-width="1"/><circle cx="30" cy="22" r="1.8" fill="#3FE0D0" stroke="#0E0B2B" stroke-width="1"/></svg>';
async function champFlow(){var T=G.teams.slice().sort(function(a,b){return b.score-a.score;}),W=T[0];
  var best=G.all.slice().sort(function(a,b){return b.pts-a.pts;})[0];
  var fs=Math.round(clamp(1300/Math.max(8,W.name.length),58,104));
  await scene('champ',{build:function(){var s=$('#sc-champ');
    var P3=[[1,540,420,200,150,132],[2,330,466,200,104,104],[3,750,496,200,74,92]],pods='';
    P3.forEach(function(q){var t=T[q[0]-1];if(!t)return;pods+='<div class="pod p'+q[0]+'" style="left:'+q[1]+'px;top:'+q[2]+'px;width:'+q[3]+'px;height:'+q[4]+'px;--c:'+t.color+'"><b>'+q[0]+'</b><span>'+t.score+' PTS</span></div>'
      +'<div class="L podb" id="pb-'+t.id+'" style="left:'+(q[1]+q[3]/2-q[5]/2)+'px;top:'+(q[2]-q[5]-4)+'px;width:'+q[5]+'px;height:'+q[5]+'px;font-size:'+Math.round(q[5]*.36)+'px">'+badge(t)+'</div>';});
    s.innerHTML='<div class="L ch-k"><span class="pillk pk" id="ch-k">Tonight\'s champions</span></div><div class="L ch-name mega" id="ch-name" style="font-size:'+fs+'px">'+esc(W.name)+'</div>'+pods
      +'<div class="L crownw" id="crownw">'+CROWN+'</div>'
      +'<svg class="L trophy" viewBox="0 0 220 240" aria-hidden="true"><path d="M50 30H170V90C170 130 140 152 110 152C80 152 50 130 50 90Z" fill="#FFC21F" stroke="#0E0B2B" stroke-width="8" stroke-linejoin="round"/><path d="M50 50C18 50 14 90 50 104M170 50C202 50 206 90 170 104" fill="none" stroke="#0E0B2B" stroke-width="14"/><path d="M50 50C18 50 14 90 50 104M170 50C202 50 206 90 170 104" fill="none" stroke="#FFC21F" stroke-width="6"/><path d="M96 150H124V184H96Z" fill="#E09A14" stroke="#0E0B2B" stroke-width="8"/><path d="M62 184H158V220H62Z" fill="#FF4FA0" stroke="#0E0B2B" stroke-width="8" stroke-linejoin="round"/><path d="M110 52l9 18 20 3-14 14 3 20-18-9-18 9 3-20-14-14 20-3z" fill="#FFF8EC" stroke="#0E0B2B" stroke-width="5" stroke-linejoin="round"/><ellipse cx="72" cy="62" rx="6" ry="16" fill="#fff" opacity=".6"/></svg>'
      +(T[3]?'<div class="L fourth" id="ch-4">'+badge(T[3])+'<span>4th · '+esc(T[3].name)+'</span><b>'+T[3].score+'</b></div>':'')
      +'<div class="L tcard ooth holo" id="ooth"><span class="ok">OBJECT OF THE NIGHT</span><div class="oa"></div><div class="on">'+esc(best.name)+'</div><div class="oo">'+esc(best.nm)+' · '+esc(team(best.team).name)+'</div><div class="ol">'+esc(best.brag)+'</div></div>';
    $('#ooth .oa').appendChild(sticker(best));$$('#sc-champ .pod,#sc-champ .podb,#crownw,#ch-name,#ch-k,.trophy,#ooth,#ch-4').forEach(function(e){e.style.opacity=0;});}});
  stage(4);MUS.set('tension');BG.set('tension');CROWD_ON=true;SFX.drumroll(2.2);
  for(var k=2;k>=0;k--){var t=T[k];if(!t)continue;var pod=$('#sc-champ .pod.p'+(k+1)),pb=$('#pb-'+t.id);
    pod.style.opacity=1;A(pod,[{transform:'translateY(300px)'},{transform:'none'}],{sp:'soft'});SFX.thump();await sleep(k?380:520);
    if(k===0){MUS.set('win');BG.set('gold');SFX.ko();flash(.85);punch(1.07);}else SFX.coin();
    pb.style.opacity=1;slam(pb,{sh:k?6:18,from:2.6});if(k===0){FX.confetti(640,300,140,{pow:1400});}await sleep(k?420:260);}
  var cw=$('#crownw');cw.style.opacity=1;A(cw,[{transform:'translateY(-320px) rotate(-40deg)'},{transform:'rotate(-10deg)'}],{sp:'drop'});setTimeout(function(){SFX.stamp();shake(10);kickEyes(null,10);},360);
  var cn=$('#ch-name');cn.style.opacity=1;slam(cn,{rot:-2,sh:16});var ck=$('#ch-k');ck.style.opacity=1;popIn(ck,{r:-2});HOST.react('glee',3500);SFX.fanfare();
  for(var c=0;c<6;c++)setTimeout(function(i){FX.confetti(i%2?1260:20,700,90,{ang:i%2?-2.2:-.95,spread:.4,pow:1500,life:3});SFX.thump();}.bind(null,c),c*450);
  var g=GEN;(function fw(){if(g!==GEN||curScene!=='champ')return;FX.rocket(rnd(320,960),rnd(110,250),pick(CONF));setTimeout(fw,rnd(550,950));})();
  await sleep(600);var tro=$('#sc-champ .trophy');tro.style.opacity=1;popIn(tro,{r:-6});var oo=$('#ooth');oo.style.opacity=1;slam(oo,{rot:3,sh:8});kickEyes(oo,14);var f4=$('#ch-4');if(f4){f4.style.opacity=1;popIn(f4,{r:-2,delay:300});}
  A(tro,[{transform:'rotate(-6deg)'},{transform:'rotate(4deg) translateY(-8px)'},{transform:'rotate(-6deg)'}],{d:2400,it:Infinity,e:'ease-in-out',delay:900,fill:'none'});
  endScreen(T);
  await HOST.say(W.you?'Your champions: **you**! Eternal bragging rights, effective immediately.':'Your champions: **'+W.name+'**! Their prize? Eternal bragging rights.',{brow:'up',hold:1600});
  await HOST.say('Thank you for playing **Snag and Brag**. Put everything back. Especially the crown.',{hold:3000});
}
function endScreen(T){var y=G.you,rk=T.indexOf(y)+1;phone('p-end');$('#e-rank').textContent=rk;$('#e-suf').textContent=['st','nd','rd','th'][Math.min(3,rk-1)];
  $('#e-line').textContent=rk===1?'Champions! The TV agrees.':rk===2?'So close. Demand a rematch.':'The couch remembers. Run it back.';
  var mine=G.all.filter(function(f){return f.team==='you';}).sort(function(a,b){return b.pts-a.pts;}),best=mine[0];var c=$('#e-card');c.className='tcardp holo';
  c.innerHTML='<div class="tin"><div class="tt"><span>'+esc(y.name)+'</span><span>Best find</span></div><div class="tart"></div><div class="tn">'+esc(best.name)+'</div><div class="ts"><div>POINTS<b>'+best.pts+'</b></div><div>ROUND<b>'+(best.r+1)+'</b></div><div>SNAGGED<b>'+fmt(best.time)+'</b></div></div></div>';
  c.querySelector('.tart').appendChild(sticker(best));
  var rows=$('#e-rows');rows.innerHTML='';mine.slice().sort(function(a,b){return a.r-b.r;}).forEach(function(f){rows.appendChild(h('<div class="lrow"><span class="n">'+(f.r+1)+'</span><div>'+esc(f.name)+'<small>'+esc(ROUNDS[f.r].nice)+' · '+esc(f.nm)+'</small></div><span class="v">+'+f.pts+'</span></div>'));});
  A(c,[{transform:'scale(.4) rotate(-20deg)',opacity:0},{transform:'none',opacity:1}],{sp:'pop',delay:200});setTimeout(function(){PFX.burst(rk===1?110:50,rk===1?null:[y.color,'#FFD43B','#FFF8EC']);},500);if(rk===1)setTimeout(function(){PFX.burst(80);},1300);}
(function(){var c=$('#e-card');function tilt(e){var r=c.getBoundingClientRect();var x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;c.style.transform='perspective(700px) rotateY('+(x*24)+'deg) rotateX('+(-y*24)+'deg)';}
  c.addEventListener('pointermove',tilt);c.addEventListener('pointerleave',function(){c.style.transform='';});
  window.addEventListener('deviceorientation',function(e){if(CURP!=='p-end'||e.gamma==null)return;c.style.transform='perspective(700px) rotateY('+clamp(e.gamma,-30,30)*.6+'deg) rotateX('+clamp(e.beta-45,-30,30)*-.6+'deg)';});})();

/* =====================================================================
   MAIN
   ===================================================================== */
async function playRound(r){G.r=r;var R=ROUNDS[r];G.cur={r:r,P:choosePrompt(R.kind),finds:{}};var before={};G.teams.forEach(function(t){before[t.id]=t.score;});
  await introFlow(r);await huntFlow();
  G.teams.forEach(function(t){var f=G.cur.finds[t.id];f.r=r;G.all.push(f);});
  if(R.kind==='color')await judgeFlow();else if(R.kind==='brag')await bragFlow();else await showFlow();
  await standFlow(r,before);}
async function main(rejoin){var g=GEN;try{
  await lobbyFlow(rejoin);
  for(var r=0;r<3;r++)await playRound(r);
  await champFlow();
}catch(e){if(e&&e.cancel)return;throw e;}}
function boot(rejoin){GEN++;FEED_ON=false;skipFn=null;setSkip(false);CROWD_ON=false;PREV_RANK=null;VF.active=false;HOST.q=Promise.resolve();HOST.typing=false;
  freshState(rejoin);buildChips();pips(-1);$('#rr').textContent='ROOM K7QF';MUS.set('lobby');BG.set('normal');
  $$('#jpd span').forEach(function(s){s.classList.remove('on');});$$('.scn').forEach(function(s){if(s.id!=='sc-lobby')s.innerHTML='';});scene('lobby',{wipe:!!rejoin});
  if(rejoin){$$('#lgs,#lga,#lgb,#lgt,#joincard').forEach(function(e){e.style.opacity=1;});}
  pme();main(rejoin);}
$('#b-join').addEventListener('click',function(){press($('#b-join'));ac();var n=tname.value.trim()||pick(TEAM_NAMES);G.you.name=n.slice(0,20);G.you.mono=monoOf(G.you.name);G.joinReq=true;if(G._join)G._join();});
tname.addEventListener('keydown',function(e){if(e.key==='Enter')$('#b-join').click();});
$('#b-again').addEventListener('click',function(){press($('#b-again'));SFX.whoosh();boot(true);});
$('#b-snd').addEventListener('click',function(){AU.sfx=!AU.sfx;this.setAttribute('aria-pressed',AU.sfx);ac();if(AU.sfx)SFX.sel();});
$('#b-mus').addEventListener('click',function(){AU.mus=!AU.mus;this.setAttribute('aria-pressed',AU.mus);ac();if(AU.mb)AU.mb.gain.setTargetAtTime(AU.mus?.22:0,AU.ctx.currentTime,.1);});
document.addEventListener('visibilitychange',function(){if(!AU.ctx)return;if(document.hidden)AU.ctx.suspend();else AU.ctx.resume();});
window.__SB={G:function(){return G;},VF:VF,GLOW:GLOW,CAM:CAM,skip:function(){if(skipFn)skipFn();},HOST:HOST,MASH:function(){return MASH;}};
AI.init();
boot(false);
requestAnimationFrame(frame);
})();
