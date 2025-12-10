import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: 'src/renderer',
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../saas-frontend/src'),
      '@/components': path.resolve(__dirname, '../saas-frontend/src/components'),
      '@/lib': path.resolve(__dirname, '../saas-frontend/src/lib')
    }
  },
  server: {
    port: 5173
  }
});
