import { CHROME_EXTENSION_ID, FIREFOX_EXTENSION_ID } from './shared/constants.js';

interface NativeHostConfig {
  name: string;
  description: string;
  path: string;
  type: string;
  allowed_origins?: string[];
  allowed_extensions?: string[];
}

const baseConfig = {
  name: 'com.jtdowney.tapestry',
  description: 'Native messaging host for Tapestry browser extension',
  path: 'BINARY_PATH_PLACEHOLDER',
  type: 'stdio',
} as const;

export function generateChromeNativeHostConfig(): NativeHostConfig {
  return {
    ...baseConfig,
    allowed_origins: [`chrome-extension://${CHROME_EXTENSION_ID}/`],
  };
}

export function generateFirefoxNativeHostConfig(): NativeHostConfig {
  return {
    ...baseConfig,
    allowed_extensions: [FIREFOX_EXTENSION_ID],
  };
}
