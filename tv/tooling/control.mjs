import { WebSocketServer, WebSocket } from 'ws';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import jpeg from 'jpeg-js';
const port=Number(process.env.TV_CONTROL_PORT??8790),dir=resolve(process.env.TV_CONTROL_OUTPUT_DIR??process.env.TV_CONTROL_DIR??resolve(import.meta.dirname,'../../docs/review/tv')),url='ws://127.0.0.1:'+port;
if(process.argv[2]==='send'){
 const m=JSON.parse(process.argv[3]??'{"command":"snapshot"}'),ws=new WebSocket(url+'/observe?runtime='+(process.env.TV_CONTROL_RUNTIME??'native'));
 ws.on('open',()=>{ws.send(JSON.stringify(m));setTimeout(()=>ws.close(),300)});ws.on('error',()=>{console.error('Local TV control is unavailable');process.exitCode=1});
}else{
 await mkdir(dir,{recursive:true});const peers=new Map();let writes=Promise.resolve(),serial=0,stressUntil=0;
 // These four files are synthetic spike fixtures. No player image ever enters this server.
 const fixtures=await Promise.all([0,1,2,3].map(i=>readFile(resolve(import.meta.dirname,'../src/stage/benchmark-assets/thumb-'+i+'.jpg'))));
 const server=new WebSocketServer({host:'127.0.0.1',port});
 const allowed=new Set(['file','kind','seq','at','round','cue','target','trigger','text','phase','from','scene','cues','exceptions','teams','completed','paused','hermes','utf8','binary','connected','source','code','players','unity','master','overlapDbfs','codec','warm','milliseconds','advancing','name','case','fps','p50','p95','p99','frames','seconds','sample','jpegReceived','jpegDrawn','audio','ws','jsHeapMiB','rssMiB','cells','mood','music','joinUrl','hostText','winner','cardStage','banner','crown','count','ready','loaded','fontError','pass','bytes','feedBytes','retained','cached']);
 for(const field of ['lineSeq','path','reason','latencyMs','durationMs','elapsedMs','prefetched','wordMarks','visemeMarks','jaw','characters','talking','voice'])allowed.add(field);
 for(const field of ['action','route','status','sessionId','actions','focused','active'])allowed.add(field);
 for(const field of ['frame','stageMs','clockMs','coreScene','mediaMs','mediaPath'])allowed.add(field);
 for(const field of ['width','height','scale','pixelWidth','pixelHeight','renderWidth','renderHeight'])allowed.add(field);
 const observer=path=>path.startsWith('/observe'), runtime=path=>path==='/native'?'native':path==='/web'?'web':path==='/benchmark'?'benchmark':'unknown';
 const accepts=(path,role)=>!new URL(path,url).searchParams.has('runtime')||new URL(path,url).searchParams.get('runtime')===role;
 const timer=setInterval(()=>{
  for(const [ws,path] of peers)if(ws.readyState===WebSocket.OPEN&&(path==='/benchmark'||path==='/native'&&Date.now()<stressUntil))for(let i=0;i<4;i++){
   const n=++serial,mark=Buffer.alloc(12);mark[0]=255;mark[1]=254;mark.writeUInt16BE(10,2);mark.writeUInt32BE(n,4);mark.writeUInt32BE(i,8);
   const header=Buffer.alloc(8);header[0]=83;header[1]=66;header[2]=i;header.writeUInt32LE(n,4);
   ws.send(Buffer.concat([header,fixtures[i].subarray(0,2),mark,fixtures[i].subarray(2)]));
  }
 },333);
 server.on('connection',(ws,req)=>{const path=req.url??'/';peers.set(ws,path);ws.on('close',()=>peers.delete(ws));ws.on('message',(bytes,binary)=>{
  if(binary){if(path==='/benchmark'&&bytes.length===7)ws.send(bytes,{binary:true});return;}
  if(path==='/benchmark'&&String(bytes)==='text-echo-probe'){ws.send(String(bytes));return;}
  let m;try{m=JSON.parse(String(bytes))}catch{return;}
  if(typeof m.command==='string'){
   if(m.command==='fixture-photo'){
    const size=720,data=Buffer.alloc(size*size*4);for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=(y*size+x)*4,inCup=x>190&&x<490&&y>160&&y<550;data[i]=inCup?242:255;data[i+1]=inCup?59:248;data[i+2]=inCup?46:236;data[i+3]=255;}
    const photo=jpeg.encode({data,width:size,height:size},80).data,header=Buffer.alloc(8);header[0]=83;header[1]=66;
    for(const [p,role]of peers)if(!observer(role)&&accepts(path,runtime(role))&&p.readyState===WebSocket.OPEN)p.send(Buffer.concat([header,photo]));return;
   }
   if(m.command==='fixture-stress'){stressUntil=Date.now()+Math.max(0,Math.min(180,Number(m.seconds??60)))*1000;return;}
   for(const [p,role] of peers)if(p!==ws&&!observer(role)&&accepts(path,runtime(role))&&p.readyState===WebSocket.OPEN)p.send(JSON.stringify(m));return;
  }
  const safe=Object.fromEntries(Object.entries(m).filter(([k,v])=>allowed.has(k)&&(typeof v==='number'||typeof v==='boolean'||typeof v==='string'&&v.length<160&&!/https?:|data:|roomkey|tvkey/i.test(v))));
  if(safe.kind){safe.runtime=runtime(path);writes=writes.then(()=>appendFile(resolve(dir,'runtime.jsonl'),JSON.stringify(safe)+'\n'));for(const [p,role]of peers)if(observer(role)&&accepts(role,safe.runtime)&&p.readyState===WebSocket.OPEN)p.send(JSON.stringify(safe));}
 });});
 server.on('listening',()=>console.log('Local TV control and privacy-filtered receipts on 127.0.0.1:'+server.address().port));
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(timer);for(const p of peers.keys())p.close();void writes.then(()=>server.close());});
}
