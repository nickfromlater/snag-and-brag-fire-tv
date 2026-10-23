import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { networkInterfaces } from 'node:os';

const lanAddresses = Object.values(networkInterfaces()).flatMap((interfaces) => interfaces ?? []).filter((address) => address.family === 'IPv4' && !address.internal).map((address) => address.address);

export default defineConfig(({ mode }) => ({
  plugins: mode === 'https' ? [basicSsl({ name: 'snag-phone', domains: ['localhost', '127.0.0.1', ...lanAddresses] })] : [],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: process.env.PHONE_RELAY_URL ? {
      '/ws': { target: process.env.PHONE_RELAY_URL, ws: true },
      '/p': { target: process.env.PHONE_RELAY_URL },
    } : undefined,
  },
  preview: { host: '0.0.0.0', port: 5173, strictPort: true },
}));
