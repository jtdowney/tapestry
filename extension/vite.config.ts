import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

import { generateChromeManifest, generateFirefoxManifest } from './src/manifest-generator.js';
import {
  generateChromeNativeHostConfig,
  generateFirefoxNativeHostConfig,
} from './src/native-host-generator.js';

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production';
  const browser = process.env.BROWSER || 'firefox';

  return {
    resolve: {
      alias: {
        $shared: resolve(__dirname, './src/shared'),
      },
    },
    plugins: [
      tailwindcss(),
      svelte(),
      {
        name: 'generate-manifest',
        writeBundle() {
          try {
            const distDir = `dist/${browser}`;
            const manifestDest = `${distDir}/manifest.json`;
            const nativeHostsDir = `dist/native-hosts`;

            const manifest =
              browser === 'chrome'
                ? generateChromeManifest()
                : generateFirefoxManifest(process.env.VERSION_SUFFIX);

            mkdirSync(distDir, { recursive: true });
            writeFileSync(manifestDest, JSON.stringify(manifest, null, 2) + '\n');
            console.log(`Generated ${browser} manifest: ${manifestDest}`);

            // Generate native host configs
            mkdirSync(nativeHostsDir, { recursive: true });

            const chromeNativeHost = generateChromeNativeHostConfig();
            const firefoxNativeHost = generateFirefoxNativeHostConfig();

            const chromeNativeHostDest = `${nativeHostsDir}/chrome.json`;
            const firefoxNativeHostDest = `${nativeHostsDir}/firefox.json`;

            writeFileSync(chromeNativeHostDest, JSON.stringify(chromeNativeHost, null, 2) + '\n');
            writeFileSync(firefoxNativeHostDest, JSON.stringify(firefoxNativeHost, null, 2) + '\n');

            console.log(`Generated native host configs:`);
            console.log(`  Chrome: ${chromeNativeHostDest}`);
            console.log(`  Firefox: ${firefoxNativeHostDest}`);
          } catch (error) {
            console.error('Failed to generate manifest and native host configs:', error);
            throw error;
          }
        },
      },
    ],
    build: {
      outDir: `dist/${browser}`,
      emptyOutDir: false,
      minify: isProduction,
      sourcemap: !isProduction,
      target: ['chrome58', 'firefox57'],
      rollupOptions: {
        input: {
          background: resolve(__dirname, 'src/background/background.ts'),
          preferences: resolve(__dirname, 'src/preferences/main.ts'),
          sidebar: resolve(__dirname, 'src/sidebar/main.ts'),
        },
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: '[name].js',
          assetFileNames: '[name].[ext]',
          format: 'es',
        },
      },
    },
    publicDir: 'public',
    define: {
      'process.env.NODE_ENV': JSON.stringify(isProduction ? 'production' : 'development'),
      'import.meta.env.DEV': JSON.stringify(!isProduction),
      'import.meta.env.PROD': JSON.stringify(isProduction),
    },
  };
});
