import { defineConfig } from 'tsup';

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
});
