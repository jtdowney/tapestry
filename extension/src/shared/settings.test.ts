import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  loadSettings,
  saveSettings,
  loadFabricSettings,
  watchSettings,
  convertSetToArray,
  convertArrayToSet,
} from './settings';

const mockStorage = {
  local: {
    get: vi.fn(),
    set: vi.fn(),
  },
  onChanged: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
  },
};

Object.defineProperty(global, 'chrome', {
  value: {
    storage: mockStorage,
  },
  writable: true,
});

describe('settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loadSettings', () => {
    it('should return default settings when storage is empty', async () => {
      mockStorage.local.get.mockResolvedValue({});

      const settings = await loadSettings();

      expect(settings).toEqual({
        fabricPath: '',
        fabricModel: '',
        fabricContext: '',
        defaultPattern: '',
        visiblePatterns: [],
        showCustomPrompt: true,
        renderAsMarkdown: true,
        sendRawContent: false,
      });
    });

    it('should return stored settings when available', async () => {
      const storedSettings = {
        fabricPath: '/usr/local/bin/fabric',
        fabricModel: 'gpt-4o',
        fabricContext: 'tapestry',
        defaultPattern: 'summarize',
        visiblePatterns: ['summarize', 'extract_wisdom'],
        showCustomPrompt: false,
        renderAsMarkdown: false,
        sendRawContent: false,
      };
      mockStorage.local.get.mockResolvedValue(storedSettings);

      const settings = await loadSettings();

      expect(settings).toEqual(storedSettings);
    });

    it('should merge defaults with partial stored settings', async () => {
      const partialSettings = {
        fabricPath: '/usr/local/bin/fabric',
        showCustomPrompt: false,
      };
      mockStorage.local.get.mockResolvedValue(partialSettings);

      const settings = await loadSettings();

      expect(settings).toEqual({
        fabricPath: '/usr/local/bin/fabric',
        fabricModel: '',
        fabricContext: '',
        defaultPattern: '',
        visiblePatterns: [],
        showCustomPrompt: false,
        renderAsMarkdown: true,
        sendRawContent: false,
      });
    });
  });

  describe('saveSettings', () => {
    it('should save settings to local storage', async () => {
      const updates = {
        fabricPath: '/opt/fabric',
        showCustomPrompt: false,
      };
      mockStorage.local.set.mockResolvedValue(undefined);

      await saveSettings(updates);

      expect(mockStorage.local.set).toHaveBeenCalledWith(updates);
    });

    it('should handle storage errors', async () => {
      const updates = { fabricPath: '/opt/fabric' };
      const error = new Error('Storage quota exceeded');
      mockStorage.local.set.mockRejectedValue(error);

      await expect(saveSettings(updates)).rejects.toThrow('Storage quota exceeded');
    });
  });

  describe('loadFabricSettings', () => {
    it('should return fabric path and model from local storage', async () => {
      const storedData = {
        fabricPath: '/usr/local/bin/fabric',
        fabricModel: 'gpt-4o',
        fabricContext: 'tapestry',
        defaultPattern: 'summarize',
      };
      mockStorage.local.get.mockResolvedValue(storedData);

      const fabricSettings = await loadFabricSettings();

      expect(fabricSettings).toEqual({
        path: '/usr/local/bin/fabric',
        model: 'gpt-4o',
        context: 'tapestry',
      });
      expect(mockStorage.local.get).toHaveBeenCalledWith([
        'fabricPath',
        'fabricModel',
        'fabricContext',
      ]);
    });

    it('should return empty object when no fabric settings exist', async () => {
      mockStorage.local.get.mockResolvedValue({});

      const fabricSettings = await loadFabricSettings();

      expect(fabricSettings).toEqual({});
    });

    it('should handle partial fabric settings', async () => {
      const storedData = {
        fabricPath: '/usr/local/bin/fabric',
      };
      mockStorage.local.get.mockResolvedValue(storedData);

      const fabricSettings = await loadFabricSettings();

      expect(fabricSettings).toEqual({
        path: '/usr/local/bin/fabric',
      });
    });
  });

  describe('saveLocal', () => {
    it('should save settings with better error handling', async () => {
      const updates = {
        fabricPath: '/opt/fabric',
        showCustomPrompt: false,
      };
      mockStorage.local.set.mockResolvedValue(undefined);

      const { saveLocal } = await import('./settings');
      await saveLocal(updates);

      expect(mockStorage.local.set).toHaveBeenCalledWith(updates);
    });

    it('should log errors and rethrow for user handling', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const updates = { fabricPath: '/opt/fabric' };
      const error = new Error('Storage quota exceeded');
      mockStorage.local.set.mockRejectedValue(error);

      const { saveLocal } = await import('./settings');

      await expect(saveLocal(updates)).rejects.toThrow('Storage quota exceeded');
      expect(consoleSpy).toHaveBeenCalledWith('Failed to save settings:', error);

      consoleSpy.mockRestore();
    });

    it('should handle chrome extension context errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const updates = { fabricPath: '/opt/fabric' };

      const error = { message: 'Extension context invalidated.' };
      mockStorage.local.set.mockRejectedValue(error);

      const { saveLocal } = await import('./settings');

      await expect(saveLocal(updates)).rejects.toEqual(error);
      expect(consoleSpy).toHaveBeenCalledWith('Failed to save settings:', error);

      consoleSpy.mockRestore();
    });
  });

  describe('watchSettings', () => {
    it('should set up storage change listener for local storage', () => {
      const callback = vi.fn();

      watchSettings(callback);

      expect(mockStorage.onChanged.addListener).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should call callback when local storage changes', () => {
      const callback = vi.fn();
      let storageListener: Function;

      mockStorage.onChanged.addListener.mockImplementation((listener) => {
        storageListener = listener;
      });

      watchSettings(callback);

      const changes = {
        fabricPath: { newValue: '/new/path', oldValue: '/old/path' },
      };
      const area = 'local';

      storageListener!(changes, area);

      expect(callback).toHaveBeenCalledWith(changes, area);
    });

    it('should not call callback for non-local storage changes', () => {
      const callback = vi.fn();
      let storageListener: Function;

      mockStorage.onChanged.addListener.mockImplementation((listener) => {
        storageListener = listener;
      });

      watchSettings(callback);

      const changes = { fabricPath: { newValue: '/new/path' } };
      const area = 'sync';

      storageListener!(changes, area);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should return cleanup function that removes listener', () => {
      const callback = vi.fn();

      const cleanup = watchSettings(callback);
      cleanup();

      expect(mockStorage.onChanged.removeListener).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('loadFabricSettings error handling', () => {
    it('should handle storage errors gracefully', async () => {
      mockStorage.local.get.mockRejectedValue(new Error('Storage unavailable'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const settings = await loadFabricSettings();

      expect(consoleSpy).toHaveBeenCalledWith('Failed to load fabric settings:', expect.any(Error));
      expect(settings).toEqual({});

      consoleSpy.mockRestore();
    });
  });

  describe('utility functions', () => {
    describe('convertSetToArray', () => {
      it('should convert Set to Array', () => {
        const set = new Set(['a', 'b', 'c']);
        const result = convertSetToArray(set);

        expect(result).toEqual(['a', 'b', 'c']);
        expect(Array.isArray(result)).toBe(true);
      });

      it('should handle empty Set', () => {
        const set = new Set();
        const result = convertSetToArray(set);

        expect(result).toEqual([]);
        expect(Array.isArray(result)).toBe(true);
      });
    });

    describe('convertArrayToSet', () => {
      it('should convert Array to Set', () => {
        const array = ['a', 'b', 'c'];
        const result = convertArrayToSet(array);

        expect(result).toBeInstanceOf(Set);
        expect(result.size).toBe(3);
        expect(result.has('a')).toBe(true);
        expect(result.has('b')).toBe(true);
        expect(result.has('c')).toBe(true);
      });

      it('should handle null array', () => {
        const result = convertArrayToSet(null);

        expect(result).toBeInstanceOf(Set);
        expect(result.size).toBe(0);
      });

      it('should handle undefined array', () => {
        const result = convertArrayToSet(undefined);

        expect(result).toBeInstanceOf(Set);
        expect(result.size).toBe(0);
      });

      it('should handle empty array', () => {
        const result = convertArrayToSet([]);

        expect(result).toBeInstanceOf(Set);
        expect(result.size).toBe(0);
      });

      it('should deduplicate array items', () => {
        const array = ['a', 'b', 'a', 'c', 'b'];
        const result = convertArrayToSet(array);

        expect(result.size).toBe(3);
        expect(result.has('a')).toBe(true);
        expect(result.has('b')).toBe(true);
        expect(result.has('c')).toBe(true);
      });
    });
  });
});
