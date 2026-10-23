import puppeteer, { type Browser, type Page } from 'puppeteer-core';

/** Decode and sample with the same default Chrome canvas smoothing as phone/src/camera.ts. */
export class PhotoCanvas {
  private constructor(readonly browser: Browser, private readonly page: Page) {}

  static async open(): Promise<PhotoCanvas> {
    const browser = await puppeteer.launch({
      executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: true, args: ['--mute-audio', '--force-color-profile=srgb'],
    });
    try {
      const page = await browser.newPage();
      await page.setRequestInterception(true);
      page.on('request', r => /^(data:|blob:|about:)/.test(r.url()) ? void r.continue() : void r.abort());
      await page.goto('about:blank');
      return new PhotoCanvas(browser, page);
    } catch (error) { await browser.close(); throw error; }
  }

  async capture(bytes: Buffer): Promise<{ jpeg: Buffer; width: number; height: number }> {
    const result = await this.page.evaluate(async (base64) => {
      const image = new Image(); image.src = `data:image/jpeg;base64,${base64}`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 720;
      const context = canvas.getContext('2d')!;
      const side = Math.min(image.naturalWidth, image.naturalHeight);
      context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 720, 720);
      return { data: canvas.toDataURL('image/jpeg', 0.8).split(',')[1]!, width: image.naturalWidth, height: image.naturalHeight };
    }, bytes.toString('base64'));
    return { jpeg: Buffer.from(result.data, 'base64'), width: result.width, height: result.height };
  }

  async rgba(jpeg: Buffer, size = 480): Promise<Uint8ClampedArray> {
    const base64 = await this.page.evaluate(async ({ encoded, size }) => {
      const image = new Image(); image.src = `data:image/jpeg;base64,${encoded}`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
      const context = canvas.getContext('2d', { willReadFrequently: true })!;
      context.drawImage(image, 0, 0, size, size);
      const rgba = context.getImageData(0, 0, size, size).data;
      let binary = '';
      for (let i = 0; i < rgba.length; i += 16384) binary += String.fromCharCode(...rgba.subarray(i, i + 16384));
      return btoa(binary);
    }, { encoded: jpeg.toString('base64'), size });
    return new Uint8ClampedArray(Buffer.from(base64, 'base64'));
  }

  async version(): Promise<string> { return this.browser.version(); }
  async close(): Promise<void> { await this.browser.close(); }
}
