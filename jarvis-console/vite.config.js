import { defineConfig } from 'vite';

// base './' : le build fonctionne depuis n'importe quel sous-dossier (GitHub Pages, Netlify, serveur perso).
export default defineConfig({
  base: './',
  server: { port: 5173, open: false },
  build: {
    target: 'esnext', // top-level await (initialisation asynchrone du moteur WebGPU)
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
  },
});
