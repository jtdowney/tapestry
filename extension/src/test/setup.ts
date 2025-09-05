import { vi } from 'vitest';

import '@testing-library/jest-dom';

const mockRuntime = {
  connectNative: vi.fn(),
  sendMessage: vi.fn(() => Promise.resolve()),
  lastError: null,
  onMessage: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
  },
  onStartup: {
    addListener: vi.fn(),
  },
  onInstalled: {
    addListener: vi.fn(),
  },
};

const mockStorage = {
  local: {
    get: vi.fn(() => Promise.resolve({})),
    set: vi.fn(() => Promise.resolve()),
  },
  sync: {
    get: vi.fn(() => Promise.resolve({})),
    set: vi.fn(() => Promise.resolve()),
  },
  onChanged: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
  },
};

const mockTabs = {
  query: vi.fn(() => Promise.resolve([])),
  sendMessage: vi.fn(),
};

const mockAction = {
  onClicked: {
    addListener: vi.fn(),
  },
};

const mockSidePanel = {
  setPanelBehavior: vi.fn(() => Promise.resolve()),
};

globalThis.chrome = {
  runtime: mockRuntime,
  storage: mockStorage,
  tabs: mockTabs,
  action: mockAction,
  sidePanel: mockSidePanel,
} as any;

vi.mock('$shared/requestId', () => ({
  generateRequestId: vi.fn(() => 'f47ac10b-58cc-4372-a567-0e02b2c3d479'),
}));
