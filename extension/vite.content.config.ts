import { resolve } from 'path';

import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

const browser = process.env.BROWSER || 'firefox';

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production';

  return {
    resolve: {
      alias: {
        $shared: resolve(__dirname, './src/shared'),
      },
    },
    plugins: [tailwindcss()],
    build: {
      outDir: `dist/${browser}`,
      emptyOutDir: false,
      minify: isProduction,
      sourcemap: !isProduction,
      target: ['chrome58', 'firefox57'],
      rollupOptions: {
        input: resolve(__dirname, 'src/content/content.ts'),
        output: {
          entryFileNames: 'content.js',
          format: 'iife',
          name: 'TapestryContent',
        },
      },
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(isProduction ? 'production' : 'development'),
      'import.meta.env.DEV': JSON.stringify(!isProduction),
      'import.meta.env.PROD': JSON.stringify(isProduction),
    },
  };
});
