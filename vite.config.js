import { defineConfig } from 'vite';
import { cpSync, existsSync } from 'node:fs';

// Runtime-loaded files (glTF models, textures) live in ./assets and are fetched by
// URL, so they are copied verbatim into the build. Vite's own bundle output goes to
// dist/build to avoid clashing with that folder.
const copyAssets = () => ({
  name: 'copy-runtime-assets',
  closeBundle() { if (existsSync('assets')) cpSync('assets', 'dist/assets', { recursive: true }); },
});

export default defineConfig({
  base: './',
  plugins: [copyAssets()],
  build: { target: 'es2022', chunkSizeWarningLimit: 2000, assetsDir: 'build' },
  server: { port: 5173 },
});
