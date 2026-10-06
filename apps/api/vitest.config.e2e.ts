import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // E2E tests hit the real database over the network (incl. Neon cold starts), so allow more than the 5s default.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
