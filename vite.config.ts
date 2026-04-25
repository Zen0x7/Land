/// <reference types="vitest" />
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/main.ts'),
      name: 'Land',
      fileName: 'land',
    },
    rollupOptions: {
      external: ['pinia', 'vue'],
      output: {
        globals: {
          pinia: 'Pinia',
          vue: 'Vue',
        },
      },
    },
  },
  plugins: [dts({ rollupTypes: true })],
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '.pnp.cjs',
        '.pnp.loader.mjs',
        '.yarn/',
        'eslint.config.js',
        'vite.config.ts',
      ],
    },
  },
});
