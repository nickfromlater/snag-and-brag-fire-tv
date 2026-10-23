import { describe, expect, it } from 'vitest';
import { inflateSync, crc32 } from 'node:zlib';
import jpeg from 'jpeg-js';
import { base64 } from '../src/stage/memory-images';
import { imageBytes, maskedPhotoPng, photoCoverage } from '../src/stage/photo-raster';

describe('native photo art coverage',()=>{
  it('round-trips binary bytes with all base64 padding lengths',()=>{
    for(const length of [1,2,3,256,257,258,12287,12288,12289,262144]){const data=Uint8Array.from({length},(_,i)=>i&255);expect(base64(data)).toBe(Buffer.from(data).toString('base64'));expect(imageBytes(base64(data))).toEqual(data);}
  });
  it('composes a synthetic photo into an alpha PNG with the calibrated mask and valid chunk checksums',()=>{
    const data=new Uint8Array(128*128*4);for(let i=0;i<data.length;i+=4){data[i]=242;data[i+1]=59;data[i+2]=46;data[i+3]=255;}
    const encoded=jpeg.encode({data,width:128,height:128},80).data,png=maskedPhotoPng(encoded),view=new DataView(png.buffer);
    expect(view.getUint32(16)).toBe(320);expect(view.getUint32(20)).toBe(320);expect(png[25]).toBe(6);
    const length=view.getUint32(33),rows=inflateSync(png.subarray(41,41+length));expect(rows.length).toBe(320*(320*4+1));
    for(let y=0;y<320;y++)for(let x=0;x<320;x++){const at=y*1281+1+x*4;expect(rows[at+3]).toBe(photoCoverage[y*320+x]);if(!rows[at+3])expect([...rows.subarray(at,at+3)]).toEqual([0,0,0]);}
    expect(photoCoverage[0]).toBe(0);expect(photoCoverage[160*320+160]).toBe(255);expect(rows[160*1281+1+160*4]).toBeGreaterThan(235);
    for(let at=8;at<png.length;){const size=view.getUint32(at);expect(crc32(png.subarray(at+4,at+8+size))).toBe(view.getUint32(at+8+size));at+=size+12;}
  });
});
