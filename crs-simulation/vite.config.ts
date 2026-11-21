import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// base './' : le jeu doit fonctionner depuis n'importe quel sous-chemin (hébergement statique, artefact, file server).
export default defineConfig({
  base: './',
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 4000 },
  server: { port: 5173, strictPort: false },
  preview: { port: 4173, strictPort: false },
  test: { environment: 'node', include: ['tests/unit/**/*.test.ts'], testTimeout: 30000 },
});
