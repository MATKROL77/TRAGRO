import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    // Los archivos con hash van a /static (caché inmutable); /assets queda para HDRI y texturas.
    assetsDir: 'static',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Ayudantes de Vite/Rollup en un chunk propio: si no, caen dentro del chunk del PDF
          // y la página lo precarga entero al abrir.
          if (id.includes('preload-helper') || id.includes('commonjsHelpers')) return 'helpers';
          if (id.includes('node_modules/three/')) return 'three';
          if (id.includes('node_modules/jspdf')) return 'pdf';
          if (id.includes('node_modules/postprocessing') || id.includes('node_modules/n8ao')) return 'post';
          return undefined;
        },
      },
    },
  },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
});
