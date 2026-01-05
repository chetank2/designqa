import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

// Read version from root package.json (single source of truth)
const rootPackageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'))
const packageJson = { version: rootPackageJson.version }

// SINGLE SOURCE OF TRUTH: API port (validated by scripts/validate-ports.mjs)
// Backend runs on 3847 internally, frontend dev server on 3846 proxies to it
const API_PORT = Number(process.env.VITE_SERVER_PORT || process.env.BACKEND_PORT || 3847);
const API_URL = process.env.VITE_API_URL || `http://127.0.0.1:${API_PORT}`;

// printConfig function to log configuration
function printConfig(config: any) {
  console.log('🔗 Configuring Vite with API proxy to port:', API_PORT);
  return config;
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/', // Use root path for SaaS web deployment
  esbuild: {
    drop: process.env.NODE_ENV === 'production' ? ['debugger'] : [] // Keep console logs in dev
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
  },
  server: {
    port: 3846,
    host: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${API_PORT}`,
        changeOrigin: true,
        secure: false,
      },
      '/reports': {
        target: `http://127.0.0.1:${API_PORT}`,
        changeOrigin: true,
        secure: false,
      },
      '/output': {
        target: `http://127.0.0.1:${API_PORT}`,
        changeOrigin: true,
        secure: false,
      },
      '/images': {
        target: `http://127.0.0.1:${API_PORT}`,
        changeOrigin: true,
        secure: false,
      },
      '/screenshots': {
        target: `http://127.0.0.1:${API_PORT}`,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    target: 'es2020',
    reportCompressedSize: false,
    cssMinify: 'esbuild',
    skipLibCheck: true,
    // Code splitting configuration to reduce bundle size
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunk for large dependencies
          vendor: ['react', 'react-dom', 'react-router-dom'],

          // UI components chunk
          ui: [
            '@heroicons/react/24/outline',
            '@heroicons/react/24/solid',
            'framer-motion',
            '@headlessui/react'
          ],

          // Forms and data handling
          forms: [
            '@tanstack/react-query',
            'react-hook-form'
          ]
        },

        // Optimize chunk size
        chunkFileNames: (chunkInfo) => {
          const facadeModuleId = chunkInfo.facadeModuleId ? chunkInfo.facadeModuleId.split('/').pop() : 'chunk';
          return `assets/[name]-[hash].js`;
        }
      }
    },

    // Set chunk size warning limit (reduced from default)
    chunkSizeWarningLimit: 500,

    // Enable fast minification and tree shaking (use esbuild for speed)
    minify: 'esbuild',

    // Source maps for debugging
    sourcemap: false // Disable in production for smaller build
  },


  // Preview server configuration
  preview: {
    port: 4173,
    host: true
  },
  define: {
    'process.env': {},
    '__SERVER_PORT__': `${API_PORT}`,
    'import.meta.env.VITE_SERVER_PORT': `"${API_PORT}"`,
    'import.meta.env.VITE_API_URL': `"${API_URL}"`,
    'import.meta.env.PACKAGE_VERSION': `"${packageJson.version}"`
  }
});
