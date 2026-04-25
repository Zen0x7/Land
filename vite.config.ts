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
});
