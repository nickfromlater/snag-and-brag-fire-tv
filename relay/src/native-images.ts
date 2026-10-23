import sharp from 'sharp';
import { PHOTO_MASK_RLE, PHOTO_MASK_SIZE } from '@snag/shared';

// libvips receives buffers only. No file paths or persistent image cache.
sharp.cache(false);
export const photoAlpha = (() => {
  const runs = Buffer.from(PHOTO_MASK_RLE, 'base64'), alpha = Buffer.alloc(PHOTO_MASK_SIZE ** 2);
  let at = 0;
  for (let i = 0; i < runs.length; i += 3) { const count = runs.readUInt16BE(i); alpha.fill(runs[i + 2]!, at, at + count); at += count; }
  if (at !== alpha.length) throw new Error('Invalid photo art coverage');
  return alpha;
})();

/** Decode/compose off the TV's JS thread, retaining the exact die-cut alpha. */
export async function nativePhoto(jpeg: Buffer): Promise<Buffer> {
  return sharp(jpeg, { limitInputPixels: 720 * 720 })
    .resize(PHOTO_MASK_SIZE, PHOTO_MASK_SIZE, { fit: 'cover', kernel: 'linear' })
    .joinChannel(photoAlpha, { raw: { width: PHOTO_MASK_SIZE, height: PHOTO_MASK_SIZE, channels: 1 } })
    .png({ compressionLevel: 6, adaptiveFiltering: true }).toBuffer();
}

/** Preserve the phone's private mosaic with crisp nearest-neighbour pixels. */
export async function nativeThumbnail(jpeg: Buffer): Promise<Buffer> {
  return sharp(jpeg, { limitInputPixels: 256 * 256 })
    .resize(576, 384, { fit: 'cover', kernel: 'nearest' })
    .removeAlpha().png({ compressionLevel: 6, adaptiveFiltering: true }).toBuffer();
}
