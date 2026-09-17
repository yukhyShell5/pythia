import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/pythia/',
  plugins: [react()],
  // Proxy requests to Express for COOP/COEP headers
  server: {
    proxy: {
      '/vendor': 'http://localhost:3001',
    },
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: {
    outDir: '../dist-web',
    emptyOutDir: true,
  },
  optimizeDeps: {
    exclude: [],
  },
});
