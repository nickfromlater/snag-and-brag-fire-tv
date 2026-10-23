import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
const root=resolve(import.meta.dirname,'../..'), review=resolve(root,'docs/review');
const receipt=JSON.parse(await readFile(resolve(review,'tv/native-scene-acceptance.json'),'utf8'));
const font=resolve(root,'assets/fonts/Rubik-700.ttf');
const run=args=>new Promise((ok,bad)=>{const p=spawn('ffmpeg',args,{cwd:root,stdio:['ignore','ignore','pipe']});let err='';p.stderr.on('data',b=>err=(err+b).slice(-1200));p.on('error',bad);p.on('exit',code=>code===0?ok():bad(new Error(err)));});
for(const scene of ['lobby','intro','hunt','judge','stand','brag','show','champ']){
 const captures=receipt.captures.filter(c=>c.scene===scene), args=['-y','-loglevel','error'], filters=[], panes=[];
 for(const [i,c] of captures.entries()){
  args.push('-i',resolve(root,c.screenshot),'-i',resolve(root,'reference/screens',c.reference));
  const label=c.name.replace('native-review-','').replaceAll('-',' ');
  filters.push(`[${i*2}:v]scale=1920:1080:flags=lanczos,pad=1920:1128:0:48:color=0x0E0B2B,drawtext=fontfile=${font}:text='VVD - ${label}':fontcolor=0xFFF8EC:fontsize=26:x=24:y=10[a${i}]`);
  filters.push(`[${i*2+1}:v]scale=1920:1080:flags=lanczos,pad=1920:1128:0:48:color=0x0E0B2B,drawtext=fontfile=${font}:text='REFERENCE - ${c.reference}':fontcolor=0xFFF8EC:fontsize=26:x=24:y=10[b${i}]`);
  filters.push(`[a${i}][b${i}]hstack=inputs=2[row${i}]`);panes.push(`[row${i}]`);
 }
 if(captures.length>1)filters.push(panes.join('')+`vstack=inputs=${captures.length}[out]`);
 args.push('-filter_complex',filters.join(';'),'-map',captures.length>1?'[out]':'[row0]','-frames:v','1','-compression_level','9','-pred','mixed',resolve(review,'tv-'+scene+'-compare.png'));
 await run(args);console.log('Compared '+scene+' ('+captures.length+' states)');
}
