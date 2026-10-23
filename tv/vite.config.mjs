import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      { find: /^react-native$/, replacement: 'react-native-web' },
      { find: '@amazon-devices/react-native-kepler', replacement: resolve(import.meta.dirname, 'src/stage/web/remote.ts') },
      { find: '@amazon-devices/react-native-svg', replacement: resolve(import.meta.dirname, 'node_modules/react-native-svg/lib/module/ReactNativeSVG.web.js') },
      { find: '@amazon-devices/react-native-reanimated', replacement: resolve(import.meta.dirname, 'src/stage/web/reanimated.tsx') },
      { find: '@amazon-devices/expo-font', replacement: resolve(import.meta.dirname, 'src/stage/web/fonts.ts') },
      { find: '@amazon-devices/react-native-w3cmedia', replacement: resolve(import.meta.dirname, 'src/stage/web/audio.ts') },
      { find: '@snag/shared', replacement: resolve(root, 'shared/src/index.ts') },
    ],
    extensions: ['.web.ts', '.web.tsx', '.ts', '.tsx', '.mjs', '.js', '.json'],
  },
  define: { __DEV__: 'true', global: 'globalThis', 'process.env.NODE_ENV': JSON.stringify('development') },
  server: { fs: { allow: [root] } },
  build: { outDir: 'dist/web' },
});
