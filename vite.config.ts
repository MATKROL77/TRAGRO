/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (/[\\/]node_modules[\\/](three|three-stdlib)[\\/]/.test(id)) return 'three';
            if (/@react-three|postprocessing|maath|n8ao|camera-controls|troika|stats-gl|meshline|detect-gpu/.test(id)) return 'r3f';
            if (/jspdf|html2canvas|fflate|canvg|dompurify|core-js/.test(id)) return 'pdf';
            return undefined;
          }
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
