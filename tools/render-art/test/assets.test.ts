import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decode } from '../src/pixels.ts';
import { sha256, readSource } from '../src/source.ts';

const root = fileURLToPath(new URL('../../../',import.meta.url));
const read = (p:string) => readFileSync(resolve(root,p));
interface FileAsset {
  file:string;pixelSize:[number,number]|null;scale:number|null;anchor:[number,number]|null;
  logicalBounds:{x:number;y:number;width:number;height:number}|null;sha256:string;bytes:number;
  frames?:{amount:number;rect:[number,number,number,number];anchor:[number,number]}[];
}
const manifest = JSON.parse(read('assets/manifest.json').toString()) as {
  sources:Record<string,string>;files:Record<string,FileAsset>;totalBytes:number;
  objects:Record<string,{eyes:unknown;col:string;variants:Record<string,string>;housePlacement:unknown}>;
};
const validation = JSON.parse(read('docs/review/art-validation.json').toString()) as {
  stickerComposites:{diff:{maxChannelDifference:number;meanAbsoluteChannelDifference:number}}[];
  photoComposites:{scale:number;background:string;diff:{maxChannelDifference:number;meanAbsoluteChannelDifference:number}}[];
  fonts:{diff:{differingPixels:number}}[];
};

describe('shippable reference art',()=>{
  it('ships all 26 reference objects with both resolutions and exact eye/color metadata',async()=>{
    const source=await readSource(root);
    expect(Object.keys(manifest.objects)).toHaveLength(26);
    for(const o of source.objects){
      const entry=manifest.objects[o.id]!;
      expect(entry.eyes).toEqual(o.eyes);expect(entry.col).toBe(o.col);
      expect(entry.housePlacement).toEqual({zone:o.zone,center:[o.x,o.y],size:o.s});
      expect(Object.keys(entry.variants)).toEqual(['192','384']);
      for(const id of Object.values(entry.variants)) expect(manifest.files[id]).toBeDefined();
    }
    expect(manifest.sources).toEqual(source.hashes);
  });

  it('has trustworthy file hashes, pixel dimensions and anchors within the memory budget',()=>{
    let bytes=0;
    for(const [id,asset] of Object.entries(manifest.files)){
      const data=read(asset.file);bytes+=data.length;
      expect(sha256(data),id).toBe(asset.sha256);expect(data.length,id).toBe(asset.bytes);
      if(asset.pixelSize){
        const image=decode(data);
        expect([image.width,image.height],id).toEqual(asset.pixelSize);
        expect(asset.anchor,id).toEqual([-asset.logicalBounds!.x*asset.scale!||0,-asset.logicalBounds!.y*asset.scale!||0]);
        let hiddenRgb=0;
        for(let i=0;i<image.data.length;i+=4) if(image.data[i+3]===0) hiddenRgb|=image.data[i]!|image.data[i+1]!|image.data[i+2]!;
        expect(hiddenRgb,id).toBe(0);
      }
    }
    expect(bytes).toBe(manifest.totalBytes);expect(bytes).toBeLessThan(15*1024*1024);
  },30000); // Decode the full atlas inventory even when the development machine is busy.

  it('leaves transparent padding around every complete sticker filter region',()=>{
    for(const [id,asset] of Object.entries(manifest.files).filter(([id])=>id.startsWith('stickers/'))){
      const png=decode(read(asset.file));
      const edge=[];
      for(let x=0;x<png.width;x++) edge.push(png.data[x*4+3]!,png.data[((png.height-1)*png.width+x)*4+3]!);
      for(let y=0;y<png.height;y++) edge.push(png.data[(y*png.width)*4+3]!,png.data[(y*png.width+png.width-1)*4+3]!);
      expect(Math.max(...edge),id).toBe(0);
      expect(png.data.some((v,i)=>i%4===3&&v===255),id).toBe(true);
    }
  });

  it('keeps sticker borders clean on ink/paper and reports photo equivalence at both scales',()=>{
    expect(validation.stickerComposites).toHaveLength(26*2*2);
    expect(validation.photoComposites).toHaveLength(4);
    for(const check of validation.stickerComposites){expect(check.diff.maxChannelDifference).toBeLessThanOrEqual(2);expect(check.diff.meanAbsoluteChannelDifference).toBeLessThan(.1);}
    for(const check of validation.photoComposites){expect(check.diff.maxChannelDifference).toBeLessThanOrEqual(3);expect(check.diff.meanAbsoluteChannelDifference).toBeLessThan(.1);}
    expect(new Set(validation.photoComposites.map(c=>c.scale))).toEqual(new Set([1.6,3.2]));
    expect(new Set(validation.photoComposites.map(c=>c.background))).toEqual(new Set(['#0E0B2B','#FFF8EC']));
  });

  it('ships usable cropped constant-stroke ellipse atlases and full host animation metadata',()=>{
    for(const [id,asset] of Object.entries(manifest.files).filter(([id])=>id.endsWith('-atlas'))){
      expect(asset.frames,id).toHaveLength(33);
      for(const frame of asset.frames!){
        const [x,y,w,h]=frame.rect;
        expect(x+w,id).toBeLessThanOrEqual(asset.pixelSize![0]);expect(y+h,id).toBeLessThanOrEqual(asset.pixelSize![1]);
        expect(w,id).toBe(asset.logicalBounds!.width*2);expect(h,id).toBe(asset.logicalBounds!.height*2);
      }
    }
    const host=JSON.parse(read('assets/host/parts.json').toString());
    expect(host.formulas.swayPivot).toEqual([100,240]);
    expect(host.formulas.monocleShockPivot).toEqual([128,78]);
    expect(Object.keys(host.brows)).toEqual(['norm','up','down']);
    for(const [pose,paths] of Object.entries(host.brows) as [string,[string,string]][])for(const [side,i] of [['left',0],['right',1]] as const){
      expect(host.parts[`brow-${pose}-${side}`].match(/ d="([^"]+)"/)[1]).toBe(paths[i]);
    }
    expect(host.rawAssembly).toContain('sx-low');expect(host.animationSource).toContain('HOST.step=function');
    for(const part of ['upper','lower','white-left','white-right','pupil-left','pupil-right','monocle','happy']) expect(manifest.files['host/'+part]).toBeDefined();
  });

  it('decodes the five bundled fonts without changing any rendered glyph pixels',()=>{
    expect(validation.fonts).toHaveLength(10);
    for(const check of validation.fonts) expect(check.diff.differingPixels).toBe(0);
    expect(readdirSync(resolve(root,'assets/fonts')).filter(p=>p.endsWith('.ttf'))).toHaveLength(5);
    for(const name of ['LilitaOne-OFL.txt','Rubik-OFL.txt']) expect(read('assets/fonts/'+name)).toEqual(read('reference/fonts/'+name));
  });

  it('includes the full prop/house inventory and resolves controller currentColor in its CSS context',()=>{
    for(const name of ['star','heart','flame','tomato'])for(const size of [96,192])expect(manifest.files[`icons/${name}-${size}`]).toBeDefined();
    for(const name of ['crown-champion','crown-judge','crown-show','crown-leader','trophy','magnifier','stopwatch','stopwatch-arc','brag-seam','sound','music','skip','dice','camera','look-up','dice-reroll'])
      expect(Object.keys(manifest.files).some(id=>id.startsWith(`props/${name}-`)),name).toBe(true);
    for(const part of ['back','front','objects'])for(const scale of [.5,1])expect(manifest.files[`house/${part}-${scale}x`]).toBeDefined();
    expect(manifest.files['house/panorama-0.5x']).toBeDefined();
    const props=JSON.parse(read('assets/props/vectors.json').toString());
    expect(props.props.skip.markup).toContain('fill="#0E0B2B"');
    expect(props.props['dice-reroll'].markup).toContain('stroke="#FFF8EC"');
    expect(props.excluded.reelArrows.css.join('\n')).toContain('border-left:36px');
  });
});
