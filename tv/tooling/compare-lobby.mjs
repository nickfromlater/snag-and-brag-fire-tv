import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../..');
const native = resolve(process.env.TV_COMPARE_NATIVE ?? resolve(root, 'docs/review/tv/native-lobby.png'));
const reference = resolve(root, 'reference/screens/tv-01-lobby.png');
const output = resolve(root, 'docs/review/tv-lobby-compare.png');
const font = resolve(root, 'assets/fonts/Rubik-700.ttf');
const pane = (index, title) => '[' + index + ':v]scale=1920:1080:flags=lanczos,pad=1920:1128:0:48:color=0x0E0B2B,drawtext=fontfile=' + font + ':text=' + title + ':fontcolor=0xFFF8EC:fontsize=26:x=24:y=10[p' + index + ']';
const filter = pane(0, 'VVD - 1920 x 1080') + ';' + pane(1, 'REFERENCE - scaled to 1920 x 1080') + ';[p0][p1]hstack=inputs=2[out]';
await new Promise((ok, bad) => {
  const child = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-i', native, '-i', reference, '-filter_complex', filter, '-map', '[out]', '-frames:v', '1', output], { stdio: ['ignore', 'pipe', 'pipe'] });
  let error = ''; child.stderr.on('data', data => { error = (error + data).slice(-1500); });
  child.once('error', bad); child.once('exit', code => code === 0 ? ok() : bad(new Error(error)));
});
console.log('Created docs/review/tv-lobby-compare.png');
