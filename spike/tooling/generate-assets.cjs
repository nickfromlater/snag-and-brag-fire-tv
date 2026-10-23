// Render the approved art, unchanged, into alpha PNGs at 2x.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const target = path.join(root, 'spike/vega-app/src/assets/stickers');
fs.mkdirSync(target, {recursive:true});
const code = fs.readFileSync(path.join(root,'reference/src/art.js'),'utf8');
const context = {document:{getElementById:()=>null, querySelector:()=>null}};
vm.createContext(context);
// The definitions are independent of the DOM bootstrap below them.
const end = code.indexOf('/* =================', 100);
vm.runInContext(code.slice(0, code.indexOf('function svgDefs') > 0 ? code.indexOf('function svgDefs') : end > 0 ? end : code.length), context);
const keys = Object.keys(context.ART).slice(0,26);
for(const key of keys) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 -12 144 144" width="288" height="288">${context.ART[key]}</svg>`;
  const file = path.join(root, 'spike/.cache',key+'.svg');
  fs.writeFileSync(file,svg);
  execFileSync('rsvg-convert',['-o',path.join(target,key+'.png'),file]);
}
fs.writeFileSync(path.join(root,'spike/vega-app/src/stickers.ts'),
  'export const stickers = [\n'+keys.map(k=>`  require('./assets/stickers/${k}.png'),`).join('\n')+'\n];\n');
console.log(`Rendered ${keys.length} original stickers as 288px alpha PNGs`);
