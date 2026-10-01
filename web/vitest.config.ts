import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Fase 4 (pruebas unitarias): entorno node puro — la lógica testida no toca DOM ni React.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  css: {
    // Los tests son de lógica pura (sin CSS): se anula la carga del postcss.config.mjs
    // de Next/Tailwind, que Vite no puede resolver fuera del pipeline de la app.
    postcss: { plugins: [] },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    reporters: ['default'],
  },
});
