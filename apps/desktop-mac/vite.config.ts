import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const frontendDir = path.resolve(__dirname, '../saas-frontend');

export default defineConfig({
  plugins: [react()],
  root: 'src/renderer',
  envDir: frontendDir,
  base: './',
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    modulePreload: {
      polyfill: false
    },
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js'
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(frontendDir, 'src'),
      '@/components': path.resolve(frontendDir, 'src/components'),
      '@/lib': path.resolve(frontendDir, 'src/lib')
    }
  },
  server: {
    port: 5173
  }
});
