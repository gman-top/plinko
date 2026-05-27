import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Deployed at https://gman-top.github.io/plinko/, so static assets need
// the /plinko/ base when built for production. Dev keeps `/`.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'production' ? '/plinko/' : '/',
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
  },
  server: {
    port: 5173,
  },
}));
