// Native-only, synthetic-media acceptance. Hold ~/.snag-vvd.lock before running.
import { WebSocket } from 'ws';
import { access, mkdir, mkdtemp, readdir, copyFile, rm, writeFile, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
const root=resolve(import.meta.dirname,'../..'), review=resolve(process.env.TV_CAPTURE_REVIEW_ROOT??resolve(root,'docs/review')), dir=resolve(review,'tv');
const mode=process.argv[2]??'scenes', records=[], captures=[], clips=[];
const progressFile=resolve(dir,'native-scene-capture-progress.json');
const saveProgress=()=>writeFile(progressFile,JSON.stringify({updatedAt:new Date().toISOString(),synthetic:true,nativeOnly:records.every(r=>r.runtime==='native'),captures,clips},null,2)+'\n');
await access(resolve(homedir(),'.snag-vvd.lock')); await mkdir(dir,{recursive:true});
const run=(cmd,args)=>new Promise((ok,bad)=>{const p=spawn(cmd,args,{cwd:root,stdio:['ignore','pipe','pipe']});let out='';p.stdout.on('data',b=>out=(out+b).slice(-30000));p.stderr.on('data',b=>out=(out+b).slice(-30000));p.on('error',bad);p.on('exit',code=>code===0?ok(out):bad(new Error(out.slice(-1800))));});
const consoleCommand=async cmd=>{const out=await run('python3',['spike/tooling/capture.py',cmd]);if(out.includes('KO:'))throw new Error(out.trim());};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const ws=new WebSocket('ws://127.0.0.1:8790/observe?runtime=native');let latest, snapshotAt=Date.now();
ws.on('message',b=>{const m=JSON.parse(String(b));records.push(m);if(m.kind==='snapshot'){latest=m;snapshotAt=Date.now();}});
const send=m=>ws.send(JSON.stringify(m));
let poll, recording, phoneProcess, failure, g2EndedAt, g2StartedAt=Date.now(), g2PhoneOutput='', g2PhoneCode, g2Join;const pendingClips=[];
const until=async(fn,ms,label)=>{const end=Date.now()+ms;while(Date.now()<end){if(fn())return;if(records.some(r=>r.kind==='exception'))throw new Error('Native exception');await wait(80);}throw new Error(label+' timed out at '+JSON.stringify(latest));};
const shot=async name=>{const folder=await mkdtemp(resolve(tmpdir(),'snag-native-capture-'));try{await consoleCommand('screenrecord screenshot '+folder);const files=(await readdir(folder)).filter(f=>f.endsWith('.png'));if(files.length!==1)throw new Error('Missing fresh VVD screenshot');await copyFile(resolve(folder,files[0]),resolve(dir,name+'.png'));}finally{await rm(folder,{recursive:true,force:true});}};
const capture=async(name,reference)=>{const state=latest;await shot(name);captures.push({name,reference,scene:state.scene,phase:state.phase,round:state.round,mood:state.mood,teams:state.teams,screenshot:'docs/review/tv/'+name+'.png'});if(mode==='scenes')await saveProgress();console.log('Captured '+name);};
const startClip=async(round,name)=>{const folder=await mkdtemp(resolve(tmpdir(),'snag-native-round-'));const raw=resolve(folder,'round.mp4');await consoleCommand('screenrecord start --size 1920x1080 --bit-rate 8M --fps 60 '+raw);recording={round,name,folder,raw,at:Date.now()};};
const stopClip=async()=>{if(!recording)return;const clip=recording;recording=undefined;await consoleCommand('screenrecord stop');pendingClips.push(clip);console.log('Captured video '+clip.name);};
// Encode after play so CPU work cannot make the observer miss a short scene state.
const finishClips=async()=>{while(pendingClips.length){const clip=pendingClips[0],output=resolve(review,clip.name+'.mp4');let bytes=Infinity,crf=28;for(;crf<=37;crf+=3){await run('ffmpeg',['-y','-loglevel','error','-i',clip.raw,'-an','-t','60','-r','60','-c:v','libx264','-threads','2','-preset','slow','-crf',String(crf),output]);bytes=(await stat(output)).size;if(bytes<=10000000)break;}const info=JSON.parse(await run('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=codec_name,width,height,r_frame_rate,nb_frames,duration','-of','json',output])).streams[0];if(info.codec_name!=='h264'||info.width!==1920||info.height!==1080||info.r_frame_rate!=='60/1'||Number(info.duration)>60.01||bytes>10000000)throw new Error('Clip fails H.264 / 1080p60 / 60 second / 10 MB bound');clips.push({round:clip.round,path:'docs/review/'+clip.name+'.mp4',bytes,crf,preset:'slow',...info});await rm(clip.folder,{recursive:true,force:true});pendingClips.shift();if(mode==='scenes')await saveProgress();console.log('Encoded '+clip.name+' ('+bytes+' bytes)');}};
const reset=async speed=>{records.length=0;latest=undefined;send({command:'reset',speed,seed:1});await until(()=>records.some(r=>r.kind==='engine'&&r.hermes)&&latest?.ready&&latest.loaded&&latest.connected,20000,'Native reset');await wait(1400);};
try{
 await new Promise((ok,bad)=>{ws.once('open',ok);ws.once('error',bad);});
 if((await run('osascript',['-e','get output muted of (get volume settings)'])).trim()!=='true')throw new Error('Mac must remain muted');
 poll=setInterval(()=>send({command:'snapshot'}),250);
 await until(()=>latest?.ready&&latest.loaded&&latest.hermes&&latest.connected,30000,'Native app');
 await wait(2500);
 if(mode==='scenes'){
  if(process.argv.includes('--resume')){const prior=JSON.parse(await readFile(progressFile,'utf8'));if(!prior.synthetic||!prior.nativeOnly)throw new Error('Unsafe capture receipt');captures.push(...prior.captures.filter(c=>c.name!=='native-review-stand'&&c.name!=='native-review-lobby'));clips.push(...prior.clips);}
  await reset(1);await until(()=>records.some(r=>r.cue==='host-finish'),15000,'Lobby welcome');await wait(400);await capture('native-review-lobby','tv-01-lobby.png');send({command:'bots',start:true});
  const done=new Set(captures.map(c=>c.name.replace('native-review-','')));let round=-1;const deadline=Date.now()+660000;
  while(Date.now()<deadline){
   const s=latest;if(!s){await wait(80);continue;}
   if(Date.now()-snapshotAt>20000)throw new Error('Native snapshots stopped at '+s.scene+'/'+s.phase);
   if(s.scene==='intro'&&s.round!==round){await stopClip();round=s.round;if(!clips.some(c=>c.round===round))await startClip(round,'tv-round-'+(round+1));}
   if(recording&&Date.now()-recording.at>57500)await stopClip();
   let key='',ref='';
   if(s.scene==='intro'&&s.phase==='title'&&records.some(r=>r.round===s.round&&r.target==='intro.title'&&r.cue==='slam')){key='intro-title-'+s.round;ref='tv-02-round-title.png';}
   else if(s.scene==='intro'&&s.phase==='reel'&&s.round===0&&records.filter(r=>r.cue==='phase'&&r.phase==='reel'&&r.round===0).length>1){key='intro-reel';ref='tv-03-prompt-reel.png';}
   else if(s.scene==='hunt'&&s.phase==='hunt'&&s.round===0){const snag=records.some(r=>r.round===0&&r.cue==='find');key=snag?'hunt-snagged':'hunt-live';ref=snag?'tv-05-snagged.png':'tv-04-hunt-live-feeds.png';}
   else if(s.scene==='judge'&&s.cardStage?.split(',').includes('scan')){key='judge-scan';ref='tv-06-pixel-judge.png';}
   else if(s.scene==='judge'&&s.cardStage?.split(',').every(x=>x==='scored')){key='judge-scored';ref='tv-06-pixel-judge.png';}
   else if(s.scene==='stand'&&s.phase==='standings'&&s.round===0){key='stand';ref='tv-07-standings.png';}
   else if(s.scene==='brag'&&s.phase==='brag-lines'){key='brag-lines';ref='tv-08-brag-lines.png';}
   else if(s.scene==='brag'&&s.phase==='mash'){key='brag-mash';ref='tv-09-brag-mash.png';}
   else if(s.scene==='brag'&&s.phase==='knockout'){key='brag-knockout';ref='tv-10-brag-knockout.png';}
   else if(s.scene==='show'&&s.phase==='vote'){key='show-vote';ref='tv-11-showstopper-vote.png';}
   else if(s.scene==='show'&&s.winner&&s.mood==='gold'){key='show-win';ref='tv-12-showstopper-win.png';}
   else if(s.scene==='champ'&&s.completed){key='champ';ref='tv-13-finale.png';}
   if(key&&!done.has(key)){done.add(key);if(key==='stand')await wait(5000);else if(key==='show-win')await wait(1000);else if(key.includes('title'))await wait(550);else if(key==='intro-reel')await wait(350);else if(key==='judge-scan')await wait(300);else await wait(1100);await capture('native-review-'+key,ref);}
   if(s.completed&&done.has('champ'))break;
   await wait(80);
  }
  await stopClip();await finishClips();
  const required=['intro-title-0','intro-title-1','intro-title-2','intro-reel','hunt-live','hunt-snagged','judge-scan','judge-scored','stand','brag-lines','brag-mash','brag-knockout','show-vote','show-win','champ'];
  if(!latest.completed||required.some(k=>!done.has(k))||clips.length!==3)throw new Error('Missing acceptance state: '+required.filter(k=>!done.has(k)).join(','));
 }else if(mode==='g2'||mode==='judge'){
  if(process.env.TV_G2_AUDIO==='false'){for(const key of ['select','down','down','select','down','select','back']){send({command:'remote',key});await wait(120);}}
  if(process.env.TV_G2_REDUCED==='true')send({command:'reduced',on:true});
  if(latest.scene!=='lobby'||latest.teams!==0)await reset(1);const join=g2Join=(process.env.TV_JOIN_ORIGIN??'http://localhost:8787')+'/?r='+latest.code, start=g2StartedAt=Date.now();let phoneDone=false, phoneCode, phoneOutput='';
  const phone=phoneProcess=spawn(process.execPath,['phone/dev/e2e-play.mjs',join],{cwd:root,stdio:['ignore','pipe','pipe']});const append=b=>{g2PhoneOutput=phoneOutput=(phoneOutput+b).slice(-30000);for(const line of String(b).split('\n'))if(/^\d+\.\d+ p-/.test(line))console.log('Phone '+line);};phone.stdout.on('data',append);phone.stderr.on('data',append);phone.on('exit',code=>{phoneDone=true;g2PhoneCode=phoneCode=code;});
  const deadline=Date.now()+450000;let recorded=false, maskShot=false, judgeShot=false;
  while(Date.now()<deadline){
   if(Date.now()-snapshotAt>20000)throw new Error('Native snapshots stopped during phone play');
   if(phoneDone&&phoneCode!==0)throw new Error(phoneOutput.slice(-1800));
   if(!recorded&&latest?.scene==='judge'&&latest.round===0){await startClip(0,'tv-g2-color-rush-reveal');recorded=true;}
   if(!maskShot&&records.some(r=>r.kind==='judge-mask-hold'&&r.ready&&r.cells>0)){maskShot=true;await capture('g2-native-mask');}
   if(!judgeShot&&latest?.scene==='judge'&&latest.banner&&latest.crown){judgeShot=true;await wait(7000);await capture('g2-native-judge-scored');if(mode==='judge'){await wait(500);await capture('native-judge-celebration-late');break;}}
   // Record the complete Color Rush, then encode after play so CPU work cannot steal beats.
   if(recording&&Date.now()-recording.at>25000&&latest?.scene!=='judge')await stopClip();
   if(phoneDone&&latest?.completed)break;await wait(100);
  }
  await stopClip();const ended=Date.now();if(mode==='judge'){phone.kill();await finishClips();await writeFile(resolve(dir,'native-judge-photo-review.json'),JSON.stringify({verifiedAt:new Date().toISOString(),nativeOnly:records.every(r=>r.runtime==='native'),speed:1,synthetic:true,exceptions:latest.exceptions,captures,clips,events:records.filter(r=>r.round===0&&(r.cue==='slam'||r.cue==='background'||r.cue==='confetti'||r.cue==='sfx'&&r.name==='fanfare'||r.kind==='judge-render'||r.kind==='background-render'))},null,2)+'\n');console.log('Native normal-speed photo judge review complete');}else{if(!phoneDone){phone.kill();throw new Error('Phone demo timed out');}await finishClips();
  if(phoneCode!==0||!latest.completed||!maskShot||clips.length!==1)throw new Error('Incomplete native phone demo');
  const screens=phoneOutput.match(/screens (.*?) errors /)?.[1].split(',')??[];
  const maskEvents=records.filter(r=>r.kind==='judge-mask'||r.kind==='judge-mask-hold');
  await writeFile(resolve(dir,'g2-phone-e2e.txt'),phoneOutput);
  await shot('g2-native-finale');
  const result={verifiedAt:new Date().toISOString(),target:'VVD OS 1.2 aarch64 Release / Hermes',speed:1,nativeOnly:records.every(r=>r.runtime==='native'),media:'Chromium built-in synthetic camera, generated in memory; no human photos or thumbnails persisted',relay:{ai:'mock',voice:'mock',reversePort:8787,hostPort:Number(new URL(join).port)},screensReached:{tv:[...new Set(records.filter(r=>r.cue==='scene'||r.kind==='snapshot').map(r=>r.scene).filter(Boolean))],phone:screens},exceptions:{native:latest.exceptions,phone:[]},audioErrors:records.filter(r=>r.kind==='audio-error'),durationSeconds:(ended-start)/1000,phoneExitCode:phoneCode,maskEvents,clips,screenshots:['docs/review/tv/g2-native-mask.png','docs/review/tv/g2-native-finale.png']};
  if(!result.nativeOnly||result.exceptions.native!==0||result.audioErrors.length||!screens.includes('p-end')||result.screensReached.tv.length!==8)throw new Error('Demo runtime, audio or scene evidence failed');
  result.celebration={bannerSlam:records.some(r=>r.cue==='slam'&&r.target==='judge.banner'),crownSlam:records.some(r=>r.cue==='slam'&&r.target==='judge.crown'),cardWobble:records.some(r=>r.cue==='animate'&&r.target?.startsWith('judge-card:')),partyBackground:records.some(r=>r.cue==='background'&&r.mood==='party'&&r.round===0),confetti:records.some(r=>r.cue==='confetti'&&r.count===120&&r.round===0),fanfare:records.some(r=>r.cue==='sfx'&&r.name==='fanfare'&&r.round===0),capture:judgeShot};if(!Object.values(result.celebration).every(Boolean))throw new Error('Missing native judge celebration evidence');result.screenshots.push('docs/review/tv/g2-native-judge-scored.png');result.pass=true;result.completed=latest.completed;result.photoEvents=records.filter(r=>r.kind?.startsWith('photo-'));result.reducedMotion=process.env.TV_G2_REDUCED==='true';result.audioEnabled=process.env.TV_G2_AUDIO!=='false';await writeFile(resolve(dir,'g2-native-e2e.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({complete:true,seconds:result.durationSeconds,maskEvents:maskEvents.length}));}
 }else throw new Error('Use scenes or g2');
 if(mode==='scenes'){
  const receipt={verifiedAt:new Date().toISOString(),target:'VVD OS 1.2 aarch64 Release / Hermes',synthetic:true,teams:3,speed:1,nativeOnly:records.every(r=>r.runtime==='native'),exceptions:latest.exceptions,captures,clips,houseZones:[...new Set(records.filter(r=>r.kind==='camera-target').map(r=>r.case))].sort(),goldWin:captures.some(c=>c.name==='native-review-show-win'&&c.mood==='gold'),completed:latest.completed};
  if(!receipt.nativeOnly||receipt.exceptions||!receipt.goldWin||receipt.houseZones.length!==3)throw new Error('Native acceptance receipt failed');
  await writeFile(resolve(dir,'native-scene-acceptance.json'),JSON.stringify(receipt,null,2)+'\n');
 }
}catch(error){g2EndedAt=Date.now();failure=error instanceof Error?error.message:String(error);process.exitCode=1;console.error(failure.slice(-1800));}
finally{
 clearInterval(poll);
 if(phoneProcess&&phoneProcess.exitCode===null)phoneProcess.kill();
 if(recording)await stopClip().catch(error=>{failure??=String(error);});
 if(pendingClips.length)await finishClips().catch(error=>{failure??=String(error);process.exitCode=1;});
 for(const clip of pendingClips)await rm(clip.folder,{recursive:true,force:true});
 if(mode==='g2'&&failure){
  const receipt={verifiedAt:new Date().toISOString(),pass:false,completed:false,target:'VVD OS 1.2 aarch64 Release / Hermes',speed:1,nativeOnly:records.every(r=>r.runtime==='native'),media:'Chromium built-in synthetic camera; no human photos or thumbnails persisted',relay:{ai:'mock',voice:'mock',reversePort:8787,hostPort:g2Join?Number(new URL(g2Join).port):null},audioEnabled:process.env.TV_G2_AUDIO!=='false',reducedMotion:process.env.TV_G2_REDUCED==='true',screensReached:{tv:[...new Set(records.filter(r=>r.cue==='scene'||r.kind==='snapshot').map(r=>r.scene).filter(Boolean))],phone:[...new Set([...g2PhoneOutput.matchAll(/\d+\.\d+ (p-[a-z]+)/g)].map(m=>m[1]))]},exceptions:{native:latest?.exceptions??null,phone:null},audioErrors:records.filter(r=>r.kind==='audio-error'),durationSeconds:((g2EndedAt??Date.now())-g2StartedAt)/1000,phoneExitCode:g2PhoneCode??null,lastNativeSnapshot:latest??null,reason:failure.slice(-1800),maskEvents:records.filter(r=>r.kind==='judge-mask'||r.kind==='judge-mask-hold'),photoEvents:records.filter(r=>r.kind?.startsWith('photo-')),clips,screenshots:captures.map(c=>c.screenshot),note:'Failed native run. Phone error assertions and full-game visual acceptance were not reached.'};
  await writeFile(resolve(dir,'g2-native-e2e.json'),JSON.stringify(receipt,null,2)+'\n');
  await writeFile(resolve(dir,'g2-phone-e2e.txt'),g2PhoneOutput);
 }
 ws.close();
}
