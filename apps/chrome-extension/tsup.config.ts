import { defineConfig } from 'tsup';

// Get backend URL from environment variable, default to localhost
const backendUrl = process.env.EXTENSION_BACKEND_URL || 'http://localhost:3847';

export default defineConfig({
  entry: ['src/popup.tsx', 'src/background.ts', 'src/contentScript.ts'],
  format: ['esm'],
  splitting: false,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  minify: true,
  platform: 'browser',
  // Bundle all npm dependencies and workspace packages
  // Chrome extensions can't resolve ES module imports at runtime
  noExternal: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    '@myapp/compare-engine',
  ],
  // Chrome APIs are provided by the browser runtime
  external: [],
  // Replace __EXTENSION_BACKEND_URL__ with the actual URL at build time
  define: {
    '__EXTENSION_BACKEND_URL__': JSON.stringify(backendUrl),
  },
});
