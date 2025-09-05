import packageJson from '../package.json' with { type: 'json' };

import { CHROME_EXTENSION_KEY } from './shared/constants.js';

interface ManifestV3 {
  manifest_version: 3;
  name: string;
  version: string;
  description: string;
  permissions: readonly string[] | string[];
  background: {
    service_worker?: string;
    scripts?: string[];
    type: 'module';
  };
  content_scripts:
    | ReadonlyArray<{
        matches: readonly string[];
        js: readonly string[];
        run_at: string;
      }>
    | Array<{
        matches: string[];
        js: string[];
        run_at: string;
      }>;
  options_ui: {
    page: string;
    open_in_tab: boolean;
  };
  action: {
    default_title: string;
  };
  icons: {
    '16': string;
    '32': string;
    '48': string;
    '128': string;
  };
  key?: string;
  browser_specific_settings?: {
    gecko: {
      id: string;
      strict_min_version: string;
    };
  };
  side_panel?: {
    default_path: string;
  };
  sidebar_action?: {
    default_panel: string;
    default_title: string;
  };
  web_accessible_resources?: never;
}

export const baseManifest = {
  manifest_version: 3 as const,
  name: 'Tapestry',
  version: packageJson.version,
  description: 'Browser extension that integrates with Fabric AI patterns',
  permissions: ['nativeMessaging', 'storage', 'activeTab'],
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['content.js'],
      run_at: 'document_idle',
    },
  ],
  options_ui: {
    page: 'preferences.html',
    open_in_tab: true,
  },
  action: {
    default_title: 'Open Tapestry Sidebar',
  },
  icons: {
    '16': 'icons/icon-16.png',
    '32': 'icons/icon-32.png',
    '48': 'icons/icon-48.png',
    '128': 'icons/icon-128.png',
  },
} as const;

export function generateChromeManifest(): ManifestV3 {
  return {
    ...baseManifest,
    permissions: [...baseManifest.permissions, 'sidePanel'],
    background: {
      service_worker: 'background.js',
      type: 'module',
    },
    side_panel: {
      default_path: 'sidebar.html',
    },
    key: CHROME_EXTENSION_KEY,
  };
}

export function generateFirefoxManifest(versionSuffix?: string): ManifestV3 {
  const version = versionSuffix ? `${baseManifest.version}.${versionSuffix}` : baseManifest.version;

  return {
    ...baseManifest,
    version,
    browser_specific_settings: {
      gecko: {
        id: 'tapestry@jtdowney.com',
        strict_min_version: '112.0',
      },
    },
    background: {
      scripts: ['background.js'],
      type: 'module',
    },
    sidebar_action: {
      default_panel: 'sidebar.html',
      default_title: 'Tapestry',
    },
  };
}
