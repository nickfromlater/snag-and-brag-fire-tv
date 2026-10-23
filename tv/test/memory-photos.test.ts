import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryPhotos } from '../src/stage/memory-images';
import jpeg from 'jpeg-js';
import { maskedPhotoPng } from '../src/stage/photo-raster';

afterEach(() => vi.unstubAllGlobals());
describe('memory-only photo loading across relay origins', () => {
  it('fetches and composes each native find once, reuses it across scenes, and releases it on room close', async () => {
    const data = new Uint8Array(96*96*4); for(let i=0;i<data.length;i+=4){data[i]=242;data[i+1]=59;data[i+2]=46;data[i+3]=255;}
    const encoded = jpeg.encode({data,width:96,height:96},80).data;
    const png = maskedPhotoPng(encoded);
    const request = vi.fn(async(url:string)=>{expect(url).toContain('format=sticker&encoding=base64');return {ok:true,text:async()=>Buffer.from(png).toString('base64')};});vi.stubGlobal('fetch',request);
    const cache=new MemoryPhotos(),url='http://relay.test/p/SYNTH/native';
    const first=cache.loadMasked(url),second=cache.loadMasked(url);expect(first).toBe(second);
    const uri=await first;expect(uri.startsWith('data:image/png;base64,')).toBe(true);expect(cache.peek(url,true)).toBe(uri);
    expect(await cache.loadMasked(url)).toBe(uri);expect(request).toHaveBeenCalledTimes(1);
    cache.clear();expect(cache.peek(url,true)).toBeUndefined();await cache.loadMasked(url);expect(request).toHaveBeenCalledTimes(2);
  });
  it('rejects an old JPEG response instead of decoding a player photo on the native JS thread', async () => {
    vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,text:async()=>'/9j/'})));
    await expect(new MemoryPhotos().loadMasked('https://relay.test/p/SYNTH/native?k=key')).rejects.toThrow('Invalid memory sticker');
  });
  it('does not retain a late response after the room is closed', async () => {
    let finish!:()=>void;const pending=new Promise<void>(ok=>{finish=ok;});
    vi.stubGlobal('fetch',vi.fn(async()=>{await pending;return {ok:true,arrayBuffer:async()=>new Uint8Array([255,216,255]).buffer};}));
    const cache=new MemoryPhotos(),url='http://relay.test/p/SYNTH/late',request=cache.load(url);cache.clear();finish();await request;
    expect(cache.peek(url)).toBeUndefined();
  });
  it('loads without custom headers that require a browser preflight and reuses the in-memory decode', async () => {
    const request = vi.fn(async (_url: string, options: RequestInit) => {
      // The relay deliberately accepts GET/HEAD only. Non-safelisted request
      // headers would cause the browser to send an unsupported OPTIONS first.
      const headers: string[] = []; new Headers(options.headers).forEach((_value: string, key: string) => headers.push(key));
      expect(headers).toEqual([]);
      expect(options.cache).toBe('no-store');
      return { ok: true, arrayBuffer: async () => new Uint8Array([255, 216, 255]).buffer };
    });
    vi.stubGlobal('fetch', request);
    const photos = new MemoryPhotos(), url = 'http://relay.test/p/SYNTH/object';
    const first = photos.load(url), second = photos.load(url);
    expect(first).toBe(second);
    expect(await first).toBe('data:image/jpeg;base64,/9j/');
    expect(request).toHaveBeenCalledTimes(1);
    photos.clear(); await photos.load(url);
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('uses an existing synthetic in-memory data URL without making an HTTP request', async () => {
    const request = vi.fn(); vi.stubGlobal('fetch', request);
    const fixture = 'data:image/jpeg;base64,/9j/';
    expect(await new MemoryPhotos().load(fixture)).toBe(fixture);
    expect(request).not.toHaveBeenCalled();
  });
});
