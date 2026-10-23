import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { testTimeout: 10000, hookTimeout: 10000, maxWorkers: 2, fileParallelism: true } });
