import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    testTimeout: 30000,
    fileParallelism: false,
    maxWorkers: 1,
    exclude: [
      '**/node_modules/**',
      '**/e2e/**',
      '**/dist/**',
    ],
  },
});
