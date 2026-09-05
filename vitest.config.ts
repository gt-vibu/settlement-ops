import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const pkg = (name: string): string =>
  fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@settlementops/shared': pkg('shared'),
      '@settlementops/domain': pkg('domain'),
      '@settlementops/application': pkg('application'),
      '@settlementops/persistence': pkg('persistence'),
      '@settlementops/scenario': pkg('scenario'),
      '@settlementops/workflow': pkg('workflow'),
    },
  },
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'apps/web/**', 'next-app/**'],
  },
});
