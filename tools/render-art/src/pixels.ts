import { PNG } from 'pngjs';

export interface PixelDiff { pixels: number; differingPixels: number; maxChannelDifference: number; meanAbsoluteChannelDifference: number }

export function decode(bytes: Uint8Array): PNG {
  return PNG.sync.read(Buffer.from(bytes));
}

export function encode(png: PNG): Buffer {
  return PNG.sync.write(png, { colorType: 6, inputColorType: 6, bitDepth: 8, deflateLevel: 9, deflateStrategy: 3 });
}

// PNG stores straight alpha. Zero hidden RGB so premultiplication never imports a matte.
export function clean(bytes: Uint8Array): Buffer {
  const png = decode(bytes);
  for (let i = 0; i < png.data.length; i += 4) if (png.data[i + 3] === 0) png.data.fill(0, i, i + 3);
  return encode(png);
}

export function diff(a: Uint8Array, b: Uint8Array): PixelDiff {
  const x = decode(a), y = decode(b);
  if (x.width !== y.width || x.height !== y.height) throw new Error('Diff dimensions differ');
  let differingPixels = 0, maximum = 0, sum = 0;
  for (let i = 0; i < x.data.length; i += 4) {
    let changed = false;
    for (let c = 0; c < 4; c++) {
      const d = Math.abs(x.data[i + c]! - y.data[i + c]!);
      maximum = Math.max(maximum, d); sum += d; changed ||= d !== 0;
    }
    if (changed) differingPixels++;
  }
  return { pixels: x.width * x.height, differingPixels, maxChannelDifference: maximum,
    meanAbsoluteChannelDifference: Number((sum / x.data.length).toFixed(8)) };
}

export function photoLayers(alphaBytes: Uint8Array, blackBytes: Uint8Array, whiteBytes: Uint8Array, shadowBytes: Uint8Array) {
  const alpha = decode(alphaBytes), black = decode(blackBytes), white = decode(whiteBytes), rawShadow = decode(shadowBytes);
  const mask = new PNG({ width: alpha.width, height: alpha.height });
  const overlay = new PNG({ width: alpha.width, height: alpha.height });
  const geometric = new PNG({ width: alpha.width, height: alpha.height });
  const shadow = new PNG({ width: alpha.width, height: alpha.height });
  for (let i = 0; i < alpha.data.length; i += 4) {
    const t = black.data[i + 3]! / 255;
    // Keep the original full filter graph for coverage calibration: Chrome can
    // choose a different blur working region if merge inputs are removed.
    // White minus black (in premultiplied space) isolates SourceGraphic coverage.
    const coverage = [0,1,2].map(c => (white.data[i+c]! - black.data[i+c]!) / 255 * t).sort((a,b)=>a-b);
    const a = Math.max(0, Math.min(t, coverage[1]!));
    const shadowAlpha = Math.min(rawShadow.data[i+3]! / 255, a < 1 ? Math.max(0,(t-a)/(1-a)) : 1);
    shadow.data[i+3] = Math.round(shadowAlpha*255);
    const s = shadow.data[i+3]! / 255;
    if (s > 0) rawShadow.data.copy(shadow.data, i, i, i+3);
    const o = s < 1 ? Math.max(0,Math.min(1,(t-a-(1-a)*s)/(1-s))) : 0;
    // M*(1-O)=A. The residual frame color is solved from the full original
    // black-photo render, so the on-top overlay retains the original blur/edge.
    const m = 1 - o > 0 ? a / (1 - o) : 0;
    mask.data.fill(m > 0 ? 255 : 0, i, i + 3);
    mask.data[i + 3] = Math.round(m * 255);
    geometric.data.fill(alpha.data[i+3]! > 0 ? 255 : 0, i, i + 3);
    geometric.data[i + 3] = alpha.data[i+3]!;
    if (o > 0) for(let c=0;c<3;c++){
      const residual = black.data[i+c]!/255*t - (1-o-a)*s*shadow.data[i+c]!/255;
      overlay.data[i+c] = Math.max(0,Math.min(255,Math.round(residual/o*255)));
    }
    overlay.data[i + 3] = Math.round(o * 255);
  }
  return { mask: encode(mask), geometric: encode(geometric), overlay: encode(overlay), shadow: encode(shadow) };
}
