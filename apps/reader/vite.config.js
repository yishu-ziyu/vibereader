import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3217,
    strictPort: true,
    proxy: {
      '/api/minimax': {
        target: 'https://api.minimaxi.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/minimax/, '/anthropic'),
      },
      '/api/mimo': {
        target: 'https://token-plan-cn.xiaomimimo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/mimo/, '/anthropic'),
      },
      '/api/kimi': {
        target: 'https://api.moonshot.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/kimi/, '/v1'),
      },
      '/api/stepfun': {
        target: 'https://api.stepfun.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/stepfun/, '/step_plan/v1'),
      },
      '/api/llm-proxy': {
        target: 'http://127.0.0.1:8317',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/llm-proxy/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // pdfjs-dist → 单独 chunk（最大头，首屏非必须）
          if (id.includes('pdfjs-dist')) {
            return 'pdfjs';
          }
          // antd / @ant-design/x / icons → UI vendor chunk
          if (
            id.includes('antd') ||
            id.includes('@ant-design') ||
            id.includes('@ant-design/icons') ||
            id.includes('rc-')
          ) {
            return 'vendor-ui';
          }
          // react / react-dom / zustand → core vendor chunk
          if (
            id.includes('react') ||
            id.includes('react-dom') ||
            id.includes('zustand')
          ) {
            return 'vendor-core';
          }
          // katex → 数学公式渲染单独 chunk
          if (id.includes('katex')) {
            return 'katex';
          }
        },
      },
    },
  },
});
