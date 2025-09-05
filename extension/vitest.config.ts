import path from 'path';

import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';

export default defineConfig({
  plugins: [svelte(), svelteTesting()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'scripts/**',
        '**/*.config.*',
        '**/*.d.ts',
        'src/test/**',
        '**/*.test.ts',
      ],
    },
  },
  resolve: {
    alias: {
      $shared: path.resolve(__dirname, './src/shared'),
      $types: path.resolve(__dirname, './src/types'),
      // Svelte 5 support for testing library
      '@testing-library/svelte': '@testing-library/svelte/svelte5',
    },
  },
});
