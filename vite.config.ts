/// <reference types="vitest" />
import { builtinModules } from 'node:module';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

const runtimeDependencyPackages = ['express', 'socket.io'] as const;
const browserPeerDependencyPackages = ['pinia', 'vue'] as const;
const externalPackages = [
  ...runtimeDependencyPackages,
  ...browserPeerDependencyPackages,
];
const nodeBuiltinModuleSpecifiers = new Set<string>([
  ...builtinModules,
  ...builtinModules.map(
    (builtinModuleSpecifier) => `node:${builtinModuleSpecifier}`
  ),
]);

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/main.ts'),
      name: 'Land',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'land.js' : 'land.cjs'),
    },
    rollupOptions: {
      external: (moduleSpecifier) => {
        if (nodeBuiltinModuleSpecifiers.has(moduleSpecifier)) {
          return true;
        }

        return externalPackages.some(
          (externalPackageName) =>
            moduleSpecifier === externalPackageName ||
            moduleSpecifier.startsWith(`${externalPackageName}/`)
        );
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
