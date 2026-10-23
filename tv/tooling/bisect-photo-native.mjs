// In-memory synthetic photo, normal-speed native presentation bisect.
// Detach the lobby first; isolate the photo from unrelated stage decoration.
import { WebSocket } from 'ws';
import { readFile, mkdir, mkdtemp, readdir, copyFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
const root=resolve(import.meta.dirname,'../..'),dir=resolve(process.env.TV_PHOTO_BISECT_OUT??'docs/review/tv/photo-bisect');
const owner=await readFile(resolve(homedir(),'.snag-vvd.lock/owner'),'utf8');
if(!owner.startsWith('TV photo worker'))throw new Error('TV photo worker must own the VVD lock');
await mkdir(dir,{recursive:true});
const run=(cmd,args)=>new Promise((ok,bad)=>{const p=spawn(cmd,args,{cwd:root,stdio:['ignore','pipe','pipe']});let output='';p.stdout.on('data',b=>output=(output+b).slice(-3000));p.stderr.on('data',b=>output=(output+b).slice(-3000));p.on('error',bad);p.on('exit',n=>n===0?ok(output):bad(new Error(output)));});
const device=cmd=>run('zsh',['-c','source ~/vega/env >/dev/null 2>&1; '+cmd]);
const wait=ms=>new Promise(ok=>setTimeout(ok,ms));
const ws=new WebSocket('ws://127.0.0.1:8790/observe?runtime=native');let snapshot,records=[],lastSnapshot=0;
ws.on('message',b=>{const m=JSON.parse(String(b));records.push(m);if(m.kind==='snapshot'){snapshot=m;lastSnapshot=Date.now();}});
await new Promise((ok,bad)=>{ws.once('open',ok);ws.once('error',bad);});
const send=m=>ws.send(JSON.stringify(m));
const until=async test=>{const end=Date.now()+25000;while(Date.now()<end){if(test())return;await wait(100);}throw new Error('Native readiness timeout');};
const shot=async name=>{const scratch=await mkdtemp(resolve(tmpdir(),'snag-photo-shot-'));try{const out=await run('python3',['spike/tooling/capture.py','screenrecord screenshot '+scratch]);if(out.includes('KO:'))throw new Error(out);const file=(await readdir(scratch)).find(n=>n.endsWith('.png'));if(!file)throw new Error('No native screenshot');const path=resolve(dir,name+'.png');await copyFile(resolve(scratch,file),path);return {path,hash:(await run('ffmpeg',['-loglevel','error','-i',path,'-vf','crop=780:48:570:135','-f','md5','-'])).trim()};}finally{await rm(scratch,{recursive:true,force:true});}};
const poll=setInterval(()=>send({command:'snapshot'}),100),cases=[];
try{
 if((await run('osascript',['-e','get output muted of (get volume settings)'])).trim()!=='true')throw new Error('Mac must stay muted');
 for(const mode of (process.env.TV_PHOTO_BISECT_CASES??'photo,clip,eyes,mask,judge').split(',')){
  try {
  await device('vega device terminate-app --appName com.snagbrag.tv.main');await wait(500);records=[];snapshot=undefined;
  await device('vega device launch-app --appName com.snagbrag.tv.main');await until(()=>records.some(r=>r.kind==='engine')&&snapshot?.ready&&snapshot.loaded&&snapshot.connected);await wait(Number(process.env.TV_PHOTO_BISECT_STARTUP_MS??6000));send({command:'diagnostic-layer',level:-1});await wait(300);
  send({command:'fixture-photo'});await wait(300);send({command:'photo-probe',mode,count:Number(process.env.TV_PHOTO_BISECT_COUNT??4)});await wait(200);send({command:'diagnostic-layer',level:0});await until(()=>records.some(r=>r.kind==='photo-probe'&&r.case===mode));
  await wait(1500);const first=await shot('native-'+mode+'-early');await wait(8500);const last=await shot('native-'+mode+'-late');
  const cycles=records.filter(r=>r.kind==='photo-probe'&&r.case===mode).map(r=>r.frames);
  const result={mode,speed:1,seconds:10,cycles,snapshotsResponsive:Date.now()-lastSnapshot<3000,presentationAdvanced:cycles.length>=3&&first.hash!==last.hash,exceptions:records.filter(r=>r.kind==='exception').length,maskEvents:records.filter(r=>r.kind==='judge-mask').length,captures:[first.path,last.path].map(p=>p.slice(root.length+1))};cases.push(result);
  console.log(JSON.stringify(result));await writeFile(resolve(dir,'receipt.json'),JSON.stringify({verifiedAt:new Date().toISOString(),nativeOnly:true,synthetic:true,implementation:process.env.TV_PHOTO_BISECT_LABEL??'baseline native rounded Image + animated mask rows',cases},null,2)+'\n');
   } catch(error) { const capture=await shot('native-'+mode+'-stalled');cases.push({mode,speed:1,pass:false,reason:String(error.message),snapshotsResponsive:Date.now()-lastSnapshot<3000,exceptions:records.filter(r=>r.kind==='exception').length,captures:[capture.path.slice(root.length+1)]});await writeFile(resolve(dir,'receipt.json'),JSON.stringify({verifiedAt:new Date().toISOString(),nativeOnly:true,synthetic:true,implementation:process.env.TV_PHOTO_BISECT_LABEL??'baseline native rounded Image + animated mask rows',cases},null,2)+'\n');console.log(JSON.stringify(cases.at(-1))); }
 }
 send({command:'photo-probe',on:false});if(cases.some(c=>!c.presentationAdvanced||c.exceptions))process.exitCode=1;
}finally{clearInterval(poll);ws.close();}
