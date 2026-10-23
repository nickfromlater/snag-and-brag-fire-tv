import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
const root=resolve(import.meta.dirname,'../..'),font=resolve(root,'assets/fonts/Rubik-700.ttf');
const receipt=JSON.parse(await readFile(resolve(root,'docs/review/tv/g2-native-e2e.json'),'utf8'));
if(!receipt.pass||!receipt.nativeOnly||!receipt.celebration?.capture)throw new Error('A passing native G2 with celebration capture is required');
const run=args=>new Promise((ok,bad)=>{const p=spawn('ffmpeg',args,{cwd:root,stdio:['ignore','ignore','pipe']});let error='';p.stderr.on('data',b=>error=(error+b).slice(-2000));p.on('error',bad);p.on('exit',code=>code===0?ok():bad(new Error(error)));});
// Polled game state can lead or outlive a presented frame. Use the recorded native
// frame chosen in visual review when the live console still misses that short beat.
if(process.argv[2]!==undefined){
 const seconds=Number(process.argv[2]),clip=receipt.clips[0];
 if(!Number.isFinite(seconds)||seconds<0||seconds>=Number(clip.duration))throw new Error('Supply a scored frame time within the native reveal clip');
 await run(['-y','-loglevel','error','-ss',String(seconds),'-i',resolve(root,clip.path),'-frames:v','1',resolve(root,'docs/review/tv/g2-native-judge-scored.png')]);
 receipt.scoredScreenshotSource={video:clip.path,seconds,nativeOnly:true,reason:'Scored native frame selected from the same G2 reveal recording; live screenshot timing missed the short winner beat.'};
 await writeFile(resolve(root,'docs/review/tv/g2-native-e2e.json'),JSON.stringify(receipt,null,2)+'\n');
}
const files=['docs/review/tv/g2-native-mask.png','reference/screens/tv-06-pixel-judge.png','docs/review/tv/g2-native-judge-scored.png','reference/screens/tv-06-pixel-judge.png'];
const titles=['VVD - phone photo scan, mask lit','REFERENCE - Pixel Judge','VVD - scored, banner and crown','REFERENCE - Pixel Judge'];
const args=['-y','-loglevel','error'];for(const file of files)args.push('-i',resolve(root,file));
const filters=titles.map((title,i)=>`[${i}:v]scale=1920:1080:flags=lanczos,pad=1920:1128:0:48:color=0x0E0B2B,drawtext=fontfile=${font}:text='${title}':fontcolor=0xFFF8EC:fontsize=26:x=24:y=10[p${i}]`);
filters.push('[p0][p1]hstack=inputs=2[a]','[p2][p3]hstack=inputs=2[b]','[a][b]vstack=inputs=2[out]');
args.push('-filter_complex',filters.join(';'),'-map','[out]','-frames:v','1','-compression_level','9','-pred','mixed',resolve(root,'docs/review/tv-judge-compare.png'));
await run(args);
console.log('Fresh native photo scan and scored judge comparison saved');
