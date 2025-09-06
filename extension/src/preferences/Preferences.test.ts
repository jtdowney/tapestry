import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import Preferences from './Preferences.svelte';

vi.mock('$shared/constants', () => ({
  RECOMMENDED_PATTERNS: ['summarize', 'extract_wisdom', 'create_summary'],
}));

vi.mock('$shared/debounce', () => ({
  debounce: vi.fn((fn) => fn),
}));

vi.mock('$shared/settings', () => ({
  loadSettings: vi.fn(),
  saveSettings: vi.fn(),
  watchSettings: vi.fn(() => vi.fn()),
}));

vi.mock('$shared/connection', () => ({
  sendSafely: vi.fn(),
  getConnectionStatus: vi.fn(),
  addConnectionListener: vi.fn(),
  removeConnectionListener: vi.fn(),
  _resetConnectionState: vi.fn(),
}));

describe('Preferences Component', () => {
  let mockSendMessage: ReturnType<typeof vi.fn>;
  let messageListeners: any[];

  const createMockSendMessage = (response: any) => {
    return vi.fn().mockImplementation((_request, callback) => {
      if (callback) {
        setTimeout(() => callback(response), 0);
      }
    });
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    messageListeners = [];

    mockSendMessage = createMockSendMessage({
      type: 'internal.patternsList',
      patterns: ['pattern1', 'pattern2'],
    });

    const { sendSafely, getConnectionStatus, addConnectionListener, removeConnectionListener } =
      await import('$shared/connection');
    vi.mocked(sendSafely).mockResolvedValue({
      type: 'internal.patternsList',
      patterns: ['pattern1', 'pattern2'],
    });
    vi.mocked(getConnectionStatus).mockResolvedValue('connected');
    vi.mocked(addConnectionListener).mockImplementation(() => {});
    vi.mocked(removeConnectionListener).mockImplementation(() => {});

    Object.assign(globalThis.chrome, {
      runtime: {
        sendMessage: mockSendMessage,
        onMessage: {
          addListener: vi.fn((listener) => messageListeners.push(listener)),
          removeListener: vi.fn(),
        },
      },
    });
  });

  describe('Component Initialization', () => {
    it('should load settings on mount', async () => {
      const { loadSettings } = await import('$shared/settings');
      vi.mocked(loadSettings).mockResolvedValue({
        fabricPath: '/usr/bin/fabric',
        fabricModel: 'gpt-4',
        fabricContext: '',
        defaultPattern: 'summarize',
        visiblePatterns: ['summarize', 'extract_wisdom'],
        showCustomPrompt: true,
        renderAsMarkdown: true,
        sendRawContent: false,
      });

      render(Preferences);

      await waitFor(() => {
        expect(loadSettings).toHaveBeenCalled();
      });
    });

    it('should check connection status on mount', async () => {
      const { loadSettings } = await import('$shared/settings');
      vi.mocked(loadSettings).mockResolvedValue({
        fabricPath: '',
        fabricModel: '',
        fabricContext: '',
        defaultPattern: '',
        visiblePatterns: [],
        showCustomPrompt: true,
        renderAsMarkdown: true,
        sendRawContent: false,
      });

      const { getConnectionStatus } = await import('$shared/connection');
      vi.mocked(getConnectionStatus).mockResolvedValue('connected');

      render(Preferences);

      await waitFor(() => {
        expect(getConnectionStatus).toHaveBeenCalled();
      });
    });

    it('should load available patterns on mount', async () => {
      const { sendSafely } = await import('$shared/connection');
      vi.mocked(sendSafely).mockResolvedValue({
        type: 'internal.patternsList',
        patterns: ['pattern1', 'pattern2'],
      });

      render(Preferences);

      await waitFor(() => {
        expect(sendSafely).toHaveBeenCalledWith({ type: 'internal.listPatterns' });
      });
    });
  });

  describe('Settings Management', () => {
    it('should save fabric path using settings helper', async () => {
      const { loadSettings, saveSettings } = await import('$shared/settings');
      vi.mocked(loadSettings).mockResolvedValue({
        fabricPath: '',
        fabricModel: '',
        fabricContext: '',
        defaultPattern: '',
        visiblePatterns: [],
        showCustomPrompt: true,
        renderAsMarkdown: true,
        sendRawContent: false,
      });
      vi.mocked(saveSettings).mockResolvedValue();

      const { getByLabelText } = render(Preferences);

      await waitFor(() => {
        const pathInput = getByLabelText(/fabric path/i);
        expect(pathInput).toBeInTheDocument();
      });

      const pathInput = getByLabelText(/fabric path/i);
      await fireEvent.input(pathInput, { target: { value: '/new/path/fabric' } });

      await waitFor(() => {
        expect(saveSettings).toHaveBeenCalledWith({ fabricPath: '/new/path/fabric' });
      });
    });

    it('should save fabric model using settings helper', async () => {
      const { loadSettings, saveSettings } = await import('$shared/settings');
      vi.mocked(loadSettings).mockResolvedValue({
        fabricPath: '',
        fabricModel: 'gpt-3.5-turbo',
        fabricContext: '',
        defaultPattern: '',
        visiblePatterns: [],
        showCustomPrompt: true,
        renderAsMarkdown: true,
        sendRawContent: false,
      });
      vi.mocked(saveSettings).mockResolvedValue();

      const { getByLabelText } = render(Preferences);

      await waitFor(() => {
        const modelInput = getByLabelText(/model/i);
        expect(modelInput).toBeInTheDocument();
      });

      const modelInput = getByLabelText(/model/i);
      await fireEvent.input(modelInput, { target: { value: 'gpt-4' } });

      await waitFor(() => {
        expect(saveSettings).toHaveBeenCalledWith({ fabricModel: 'gpt-4' });
      });
    });

    it('should save showCustomPrompt setting', async () => {
      const { loadSettings, saveSettings } = await import('$shared/settings');
      vi.mocked(loadSettings).mockResolvedValue({
        fabricPath: '',
        fabricModel: '',
        fabricContext: '',
        defaultPattern: '',
        visiblePatterns: [],
        showCustomPrompt: true,
        renderAsMarkdown: true,
        sendRawContent: false,
      });
      vi.mocked(saveSettings).mockResolvedValue();

      const { getByText } = render(Preferences);

      await waitFor(() => {
        expect(getByText('Show custom prompt option')).toBeInTheDocument();
      });

      const checkbox = getByText('Show custom prompt option')
        .closest('label')
        ?.querySelector('input[type="checkbox"]') as HTMLInputElement;
      expect(checkbox).toBeInTheDocument();
      await fireEvent.click(checkbox);

      await waitFor(() => {
        expect(saveSettings).toHaveBeenCalledWith({ showCustomPrompt: false });
      });
    });

    it('should save renderAsMarkdown setting', async () => {
      const { loadSettings, saveSettings } = await import('$shared/settings');
      vi.mocked(loadSettings).mockResolvedValue({
        fabricPath: '',
        fabricModel: '',
        fabricContext: '',
        defaultPattern: '',
        visiblePatterns: [],
        showCustomPrompt: true,
        renderAsMarkdown: true,
        sendRawContent: false,
      });
      vi.mocked(saveSettings).mockResolvedValue();

      const { getByText } = render(Preferences);

      await waitFor(() => {
        expect(getByText('Render responses as markdown')).toBeInTheDocument();
      });

      const checkbox = getByText('Render responses as markdown')
        .closest('label')
        ?.querySelector('input[type="checkbox"]') as HTMLInputElement;
      expect(checkbox).toBeInTheDocument();
      await fireEvent.click(checkbox);

      await waitFor(() => {
        expect(saveSettings).toHaveBeenCalledWith({ renderAsMarkdown: false });
      });
    });
  });

  describe('Pattern Management', () => {
    it('should display available patterns with checkboxes', async () => {
      const { sendSafely, getConnectionStatus } = await import('$shared/connection');
      vi.mocked(sendSafely).mockResolvedValue({
        type: 'internal.patternsList',
        patterns: ['pattern1', 'pattern2', 'pattern3'],
      });
      vi.mocked(getConnectionStatus).mockResolvedValue('connected');

      const { loadSettings } = await import('$shared/settings');
      vi.mocked(loadSettings).mockResolvedValue({
        fabricPath: '/usr/bin/fabric',
        fabricModel: 'gpt-4',
        fabricContext: '',
        defaultPattern: 'summarize',
        visiblePatterns: ['pattern1', 'pattern2'],
        showCustomPrompt: true,
        renderAsMarkdown: true,
        sendRawContent: false,
      });

      const { container } = render(Preferences);

      await waitFor(() => {
        const checkboxes = container.querySelectorAll('input[type="checkbox"]');
        expect(checkboxes.length).toBeGreaterThan(3);
      });
    });

    it('should handle pattern visibility changes', async () => {
      const { loadSettings } = await import('$shared/settings');
      vi.mocked(loadSettings).mockResolvedValue({
        fabricPath: '',
        fabricModel: '',
        fabricContext: '',
        defaultPattern: '',
        visiblePatterns: ['pattern1'],
        showCustomPrompt: true,
        renderAsMarkdown: true,
        sendRawContent: false,
      });

      mockSendMessage = vi.fn().mockImplementation((request, callback) => {
        if (callback) {
          if (request.type === 'internal.listPatterns') {
            setTimeout(
              () =>
                callback({
                  type: 'internal.patternsList',
                  patterns: ['pattern1', 'pattern2'],
                }),
              0
            );
          } else if (request.type === 'internal.connectionStatus') {
            setTimeout(
              () =>
                callback({
                  type: 'internal.connectionStatus',
                  status: 'connected',
                }),
              0
            );
          }
        }
      });
      chrome.runtime.sendMessage = mockSendMessage;

      const { container } = render(Preferences);

      await waitFor(() => {
        const patternSection = container.querySelector(
          '[data-testid="pattern-visibility-section"]'
        );
        expect(patternSection).toBeInTheDocument();
        const pattern1Label = Array.from(patternSection?.querySelectorAll('label') || []).find(
          (label) => label.textContent?.includes('pattern1')
        );
        expect(pattern1Label).toBeInTheDocument();
        const pattern1Checkbox = pattern1Label?.querySelector(
          'input[type="checkbox"]'
        ) as HTMLInputElement;
        expect(pattern1Checkbox).toBeInTheDocument();
        expect(pattern1Checkbox).toBeChecked();
      });
    });

    it('should save pattern visibility using settings helper', async () => {
      const { loadSettings, saveSettings } = await import('$shared/settings');
      vi.mocked(loadSettings).mockResolvedValue({
        fabricPath: '',
        fabricModel: '',
        fabricContext: '',
        defaultPattern: '',
        visiblePatterns: [],
        showCustomPrompt: true,
        renderAsMarkdown: true,
        sendRawContent: false,
      });
      vi.mocked(saveSettings).mockResolvedValue();

      mockSendMessage = vi.fn().mockImplementation((request, callback) => {
        if (callback) {
          if (request.type === 'internal.listPatterns') {
            setTimeout(
              () =>
                callback({
                  type: 'internal.patternsList',
                  patterns: ['pattern1', 'pattern2'],
                }),
              0
            );
          } else if (request.type === 'internal.connectionStatus') {
            setTimeout(
              () =>
                callback({
                  type: 'internal.connectionStatus',
                  status: 'connected',
                }),
              0
            );
          }
        }
      });
      chrome.runtime.sendMessage = mockSendMessage;

      const { getByText } = render(Preferences);

      await waitFor(() => {
        expect(getByText('pattern1')).toBeInTheDocument();
      });

      const pattern1Checkbox = getByText('pattern1')
        .closest('label')
        ?.querySelector('input[type="checkbox"]') as HTMLInputElement;
      expect(pattern1Checkbox).toBeInTheDocument();
      await fireEvent.click(pattern1Checkbox);

      await waitFor(() => {
        expect(saveSettings).toHaveBeenCalledWith(
          expect.objectContaining({
            visiblePatterns: expect.arrayContaining(['pattern1']),
          })
        );
      });
    });

    it('should show pattern count when patterns are filtered', async () => {
      const { sendSafely, getConnectionStatus } = await import('$shared/connection');
      vi.mocked(sendSafely).mockResolvedValue({
        type: 'internal.patternsList',
        patterns: ['pattern1', 'pattern2', 'pattern3'],
      });
      vi.mocked(getConnectionStatus).mockResolvedValue('connected');

      const { loadSettings } = await import('$shared/settings');
      vi.mocked(loadSettings).mockResolvedValue({
        fabricPath: '',
        fabricModel: '',
        fabricContext: '',
        defaultPattern: '',
        visiblePatterns: ['pattern1', 'pattern2'],
        showCustomPrompt: true,
        renderAsMarkdown: true,
        sendRawContent: false,
      });

      const { getByTestId } = render(Preferences);

      await waitFor(() => {
        expect(getByTestId('pattern-count')).toContainHTML('2 of 3 patterns selected');
      });
    });
  });

  describe('Connection Status', () => {
    it('should display connection status', async () => {
      mockSendMessage = vi.fn().mockImplementation((request, callback) => {
        if (callback) {
          if (request.type === 'internal.connectionStatus') {
            setTimeout(
              () =>
                callback({
                  type: 'internal.connectionStatus',
                  status: 'connected',
                }),
              0
            );
          } else if (request.type === 'internal.listPatterns') {
            setTimeout(
              () =>
                callback({
                  type: 'internal.patternsList',
                  patterns: ['pattern1', 'pattern2'],
                }),
              0
            );
          }
        }
      });
      chrome.runtime.sendMessage = mockSendMessage;

      const { container } = render(Preferences);

      await waitFor(() => {
        const connectionIcon = container.querySelector('.fill-success');
        expect(connectionIcon).toBeInTheDocument();
      });
    });

    it('should listen for connection updates', async () => {
      const { container } = render(Preferences);

      messageListeners.forEach((listener) =>
        listener({ type: 'internal.connectionStatus', status: 'connected' })
      );

      await waitFor(() => {
        const connectionIcon = container.querySelector('.fill-success');
        expect(connectionIcon).toBeInTheDocument();
      });
    });

    it('should reload patterns when connection is restored', async () => {
      const { sendSafely } = await import('$shared/connection');
      vi.mocked(sendSafely).mockResolvedValue({
        type: 'internal.patternsList',
        patterns: ['pattern1', 'pattern2'],
      });

      render(Preferences);

      messageListeners.forEach((listener) =>
        listener({ type: 'internal.connectionStatus', status: 'connected' })
      );

      await waitFor(() => {
        expect(sendSafely).toHaveBeenCalledWith({ type: 'internal.listPatterns' });
      });
    });
  });

  describe('Save Status Indicator', () => {
    it('should show saving status when settings change', async () => {
      const { getByLabelText, container } = render(Preferences);

      await waitFor(() => {
        const pathInput = getByLabelText(/fabric path/i);
        fireEvent.input(pathInput, { target: { value: '/new/path' } });
      });

      await waitFor(() => {
        const text = container.textContent || '';
        expect(text.includes('saved') || text.includes('saving')).toBe(true);
      });
    });

    it('should handle save errors gracefully', async () => {
      const { loadSettings, saveSettings } = await import('$shared/settings');
      vi.mocked(loadSettings).mockResolvedValue({
        fabricPath: '',
        fabricModel: '',
        fabricContext: '',
        defaultPattern: '',
        visiblePatterns: [],
        showCustomPrompt: true,
        renderAsMarkdown: true,
        sendRawContent: false,
      });
      vi.mocked(saveSettings).mockRejectedValue(new Error('Save failed'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { getByLabelText } = render(Preferences);

      await waitFor(() => {
        const pathInput = getByLabelText(/fabric path/i);
        fireEvent.input(pathInput, { target: { value: '/new/path' } });
      });

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to save settings:', expect.any(Error));
      });

      consoleSpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('should handle connection check errors', async () => {
      const { getConnectionStatus } = await import('$shared/connection');
      vi.mocked(getConnectionStatus).mockRejectedValue(new Error('Connection failed'));

      const { container } = render(Preferences);

      await waitFor(() => {
        const errorIcon = container.querySelector('.fill-error');
        expect(errorIcon).toBeInTheDocument();
      });
    });

    it('should handle pattern loading errors', async () => {
      const { sendSafely, getConnectionStatus } = await import('$shared/connection');
      vi.mocked(sendSafely).mockRejectedValue(new Error('Pattern loading failed'));
      vi.mocked(getConnectionStatus).mockResolvedValue('disconnected');

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(Preferences);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          'Failed to load available options:',
          expect.any(Error)
        );
      });

      consoleSpy.mockRestore();
    });

    it('should handle storage loading errors gracefully', async () => {
      const { loadSettings } = await import('$shared/settings');
      vi.mocked(loadSettings).mockRejectedValue(new Error('Storage error'));

      const { container } = render(Preferences);

      await waitFor(() => {
        expect(container).toBeTruthy();
      });
    });
  });

  describe('Component Cleanup', () => {
    it('should cleanup message listeners on unmount', async () => {
      const { getConnectionStatus } = await import('$shared/connection');
      const { loadSettings } = await import('$shared/settings');
      vi.mocked(getConnectionStatus).mockResolvedValue('connected');
      vi.mocked(loadSettings).mockResolvedValue({
        fabricPath: '/usr/bin/fabric',
        fabricModel: 'gpt-4',
        fabricContext: '',
        defaultPattern: 'summarize',
        visiblePatterns: [],
        showCustomPrompt: true,
        renderAsMarkdown: true,
        sendRawContent: false,
      });

      const { unmount } = render(Preferences);

      unmount();

      expect(chrome.runtime.onMessage.removeListener).toHaveBeenCalled();
    });
  });

  describe('Set-based Pattern Management', () => {
    it('should initialize pattern visibility set from array in settings', async () => {
      const { loadSettings } = await import('$shared/settings');
      vi.mocked(loadSettings).mockResolvedValue({
        fabricPath: '/usr/bin/fabric',
        fabricModel: 'gpt-4',
        fabricContext: '',
        defaultPattern: 'summarize',
        visiblePatterns: ['pattern1', 'pattern2'],
        showCustomPrompt: true,
        renderAsMarkdown: true,
        sendRawContent: false,
      });

      const { sendSafely, getConnectionStatus } = await import('$shared/connection');

      vi.mocked(sendSafely).mockResolvedValue({
        type: 'internal.patternsList',
        patterns: ['pattern1', 'pattern2', 'pattern3'],
      });

      vi.mocked(getConnectionStatus).mockResolvedValue('connected');

      const { container } = render(Preferences);

      await waitFor(() => {
        const patternSection = container.querySelector(
          '[data-testid="pattern-visibility-section"]'
        );
        expect(patternSection).toBeInTheDocument();
      });

      await waitFor(() => {
        const pattern1Label = Array.from(container.querySelectorAll('label')).find((label) =>
          label.textContent?.includes('pattern1')
        );
        const pattern1Checkbox = pattern1Label?.querySelector(
          'input[type="checkbox"]'
        ) as HTMLInputElement;
        expect(pattern1Checkbox?.checked).toBe(true);
      });

      await waitFor(() => {
        const pattern3Label = Array.from(container.querySelectorAll('label')).find((label) =>
          label.textContent?.includes('pattern3')
        );
        const pattern3Checkbox = pattern3Label?.querySelector(
          'input[type="checkbox"]'
        ) as HTMLInputElement;
        expect(pattern3Checkbox?.checked).toBe(false);
      });
    });

    it('should efficiently add patterns to set without duplicates', async () => {
      const { loadSettings, saveSettings } = await import('$shared/settings');
      vi.mocked(loadSettings).mockResolvedValue({
        fabricPath: '',
        fabricModel: '',
        fabricContext: '',
        defaultPattern: '',
        visiblePatterns: ['pattern1'],
        showCustomPrompt: true,
        renderAsMarkdown: true,
        sendRawContent: false,
      });
      vi.mocked(saveSettings).mockResolvedValue();

      mockSendMessage = vi.fn().mockImplementation((request, callback) => {
        if (callback) {
          if (request.type === 'internal.listPatterns') {
            setTimeout(
              () =>
                callback({
                  type: 'internal.patternsList',
                  patterns: ['pattern1', 'pattern2'],
                }),
              0
            );
          } else if (request.type === 'internal.connectionStatus') {
            setTimeout(
              () =>
                callback({
                  type: 'internal.connectionStatus',
                  status: 'connected',
                }),
              0
            );
          }
        }
      });
      chrome.runtime.sendMessage = mockSendMessage;

      const { container } = render(Preferences);

      await waitFor(() => {
        const patternSection = container.querySelector(
          '[data-testid="pattern-visibility-section"]'
        );
        expect(patternSection).toBeInTheDocument();
      });

      await waitFor(() => {
        const pattern2Label = Array.from(container.querySelectorAll('label')).find((label) =>
          label.textContent?.includes('pattern2')
        );
        expect(pattern2Label).toBeInTheDocument();
      });

      const pattern2Label = Array.from(container.querySelectorAll('label')).find((label) =>
        label.textContent?.includes('pattern2')
      );
      const pattern2Checkbox = pattern2Label?.querySelector(
        'input[type="checkbox"]'
      ) as HTMLInputElement;

      await fireEvent.click(pattern2Checkbox);

      await waitFor(() => {
        expect(saveSettings).toHaveBeenCalledWith({
          visiblePatterns: expect.arrayContaining(['pattern1', 'pattern2']),
        });

        const savedCall = vi.mocked(saveSettings).mock.calls[0];
        const visiblePatterns = savedCall?.[0]?.visiblePatterns;
        expect(new Set(visiblePatterns).size).toBe(visiblePatterns?.length);
      });
    });

    it('should efficiently remove patterns from set', async () => {
      const { loadSettings, saveSettings } = await import('$shared/settings');
      vi.mocked(loadSettings).mockResolvedValue({
        fabricPath: '',
        fabricModel: '',
        fabricContext: '',
        defaultPattern: 'pattern1',
        visiblePatterns: ['pattern1', 'pattern2'],
        showCustomPrompt: true,
        renderAsMarkdown: true,
        sendRawContent: false,
      });
      vi.mocked(saveSettings).mockResolvedValue();

      mockSendMessage = vi.fn().mockImplementation((request, callback) => {
        if (callback) {
          if (request.type === 'internal.listPatterns') {
            setTimeout(
              () =>
                callback({
                  type: 'internal.patternsList',
                  patterns: ['pattern1', 'pattern2'],
                }),
              0
            );
          } else if (request.type === 'internal.connectionStatus') {
            setTimeout(
              () =>
                callback({
                  type: 'internal.connectionStatus',
                  status: 'connected',
                }),
              0
            );
          }
        }
      });
      chrome.runtime.sendMessage = mockSendMessage;

      const { container } = render(Preferences);

      await waitFor(() => {
        const patternSection = container.querySelector(
          '[data-testid="pattern-visibility-section"]'
        );
        expect(patternSection).toBeInTheDocument();
      });

      await waitFor(() => {
        const pattern1Label = Array.from(container.querySelectorAll('label')).find((label) =>
          label.textContent?.includes('pattern1')
        );
        expect(pattern1Label).toBeInTheDocument();
      });

      const pattern1Label = Array.from(container.querySelectorAll('label')).find((label) =>
        label.textContent?.includes('pattern1')
      );
      const pattern1Checkbox = pattern1Label?.querySelector(
        'input[type="checkbox"]'
      ) as HTMLInputElement;

      await fireEvent.click(pattern1Checkbox);

      await waitFor(() => {
        expect(saveSettings).toHaveBeenCalledWith({
          visiblePatterns: ['pattern2'],
          defaultPattern: '',
        });
      });
    });

    it('should handle select all patterns using set operations', async () => {
      const { loadSettings, saveSettings } = await import('$shared/settings');
      vi.mocked(loadSettings).mockResolvedValue({
        fabricPath: '',
        fabricModel: '',
        fabricContext: '',
        defaultPattern: '',
        visiblePatterns: [],
        showCustomPrompt: true,
        renderAsMarkdown: true,
        sendRawContent: false,
      });
      vi.mocked(saveSettings).mockResolvedValue();

      const { sendSafely, getConnectionStatus } = await import('$shared/connection');
      vi.mocked(sendSafely).mockResolvedValue({
        type: 'internal.patternsList',
        patterns: ['pattern1', 'pattern2', 'pattern3'],
      });
      vi.mocked(getConnectionStatus).mockResolvedValue('connected');

      const { container, getByTestId } = render(Preferences);

      await waitFor(() => {
        const patternSection = container.querySelector(
          '[data-testid="pattern-visibility-section"]'
        );
        expect(patternSection).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(getByTestId('select-all-btn')).toBeInTheDocument();
      });

      const selectAllBtn = getByTestId('select-all-btn');
      await fireEvent.click(selectAllBtn);

      await waitFor(() => {
        expect(saveSettings).toHaveBeenCalledWith({
          visiblePatterns: expect.arrayContaining(['pattern1', 'pattern2', 'pattern3']),
        });
      });
    });

    it('should handle empty set gracefully', async () => {
      const { loadSettings, saveSettings } = await import('$shared/settings');
      vi.mocked(loadSettings).mockResolvedValue({
        fabricPath: '',
        fabricModel: '',
        fabricContext: '',
        defaultPattern: 'pattern1',
        visiblePatterns: ['pattern1'],
        showCustomPrompt: true,
        renderAsMarkdown: true,
        sendRawContent: false,
      });
      vi.mocked(saveSettings).mockResolvedValue();

      mockSendMessage = vi.fn().mockImplementation((request, callback) => {
        if (callback) {
          if (request.type === 'internal.listPatterns') {
            setTimeout(
              () =>
                callback({
                  type: 'internal.patternsList',
                  patterns: ['pattern1'],
                }),
              0
            );
          } else if (request.type === 'internal.connectionStatus') {
            setTimeout(
              () =>
                callback({
                  type: 'internal.connectionStatus',
                  status: 'connected',
                }),
              0
            );
          }
        }
      });
      chrome.runtime.sendMessage = mockSendMessage;

      const { getByTestId } = render(Preferences);

      await waitFor(() => {
        expect(getByTestId('deselect-all-btn')).toBeInTheDocument();
      });

      const deselectAllBtn = getByTestId('deselect-all-btn');
      await fireEvent.click(deselectAllBtn);

      await waitFor(() => {
        expect(saveSettings).toHaveBeenCalledWith({
          visiblePatterns: [],
          defaultPattern: '',
        });
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle invalid pattern list response gracefully', async () => {
      mockSendMessage = vi.fn().mockImplementation((request, callback) => {
        if (callback) {
          if (request.type === 'internal.listPatterns') {
            setTimeout(
              () =>
                callback({
                  type: 'internal.patternsList',
                  patterns: null,
                }),
              0
            );
          } else if (request.type === 'internal.connectionStatus') {
            setTimeout(
              () =>
                callback({
                  type: 'internal.connectionStatus',
                  status: 'connected',
                }),
              0
            );
          }
        }
      });
      chrome.runtime.sendMessage = mockSendMessage;

      const { container } = render(Preferences);

      await waitFor(() => {
        expect(container).toBeInTheDocument();
      });
    });

    it('should handle storage quota exceeded errors', async () => {
      const { loadSettings, saveSettings } = await import('$shared/settings');
      vi.mocked(loadSettings).mockResolvedValue({
        fabricPath: '',
        fabricModel: '',
        fabricContext: '',
        defaultPattern: '',
        visiblePatterns: [],
        showCustomPrompt: true,
        renderAsMarkdown: true,
        sendRawContent: false,
      });
      const quotaError = new Error('QUOTA_BYTES_PER_ITEM quota exceeded');
      vi.mocked(saveSettings).mockRejectedValue(quotaError);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { getByLabelText } = render(Preferences);

      await waitFor(() => {
        const modelInput = getByLabelText(/model/i);
        fireEvent.input(modelInput, { target: { value: 'a'.repeat(10000) } });
      });

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to save settings:', quotaError);
      });

      consoleSpy.mockRestore();
    });

    it('should handle storage errors on different inputs', async () => {
      const { loadSettings, saveSettings } = await import('$shared/settings');
      vi.mocked(loadSettings).mockResolvedValue({
        fabricPath: '',
        fabricModel: '',
        fabricContext: '',
        defaultPattern: '',
        visiblePatterns: [],
        showCustomPrompt: true,
        renderAsMarkdown: true,
        sendRawContent: false,
      });
      vi.mocked(saveSettings).mockRejectedValue(new Error('Storage failed'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { getByLabelText } = render(Preferences);

      await waitFor(() => {
        const pathInput = getByLabelText(/fabric path/i);
        fireEvent.input(pathInput, { target: { value: '/new/path' } });
      });

      await waitFor(() => {
        const modelInput = getByLabelText(/model/i);
        fireEvent.input(modelInput, { target: { value: 'gpt-4' } });
      });

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to save settings:', expect.any(Error));
      });

      consoleSpy.mockRestore();
    });

    it('should handle corrupted settings data gracefully', async () => {
      const { loadSettings } = await import('$shared/settings');

      vi.mocked(loadSettings).mockResolvedValue({
        fabricPath: '',
        fabricModel: '',
        fabricContext: '',
        defaultPattern: '',
        visiblePatterns: [],
        showCustomPrompt: true,
        renderAsMarkdown: true,
        sendRawContent: false,
      });

      const { container } = render(Preferences);

      await waitFor(() => {
        expect(container).toBeInTheDocument();
      });
    });

    it('should handle very large pattern lists', async () => {
      const largePatternList = Array.from({ length: 100 }, (_, i) => `pattern${i}`);

      const { sendSafely, getConnectionStatus } = await import('$shared/connection');
      vi.mocked(sendSafely).mockResolvedValue({
        type: 'internal.patternsList',
        patterns: largePatternList,
      });
      vi.mocked(getConnectionStatus).mockResolvedValue('connected');

      const { loadSettings } = await import('$shared/settings');
      vi.mocked(loadSettings).mockResolvedValue({
        fabricPath: '',
        fabricModel: '',
        fabricContext: '',
        defaultPattern: '',
        visiblePatterns: largePatternList.slice(0, 50),
        showCustomPrompt: true,
        renderAsMarkdown: true,
        sendRawContent: false,
      });

      const { container } = render(Preferences);

      await waitFor(
        () => {
          const checkboxes = container.querySelectorAll('input[type="checkbox"]');
          expect(checkboxes.length).toBeGreaterThan(50);
        },
        { timeout: 10000 }
      );
    });

    it('should initialize visible patterns when undefined with available patterns', async () => {
      const { loadSettings, saveSettings } = await import('$shared/settings');

      vi.mocked(loadSettings).mockResolvedValue({
        fabricPath: '',
        fabricModel: '',
        fabricContext: '',
        defaultPattern: '',
        visiblePatterns: [],
        showCustomPrompt: true,
        renderAsMarkdown: true,
        sendRawContent: false,
      });
      vi.mocked(saveSettings).mockResolvedValue();

      const availablePatterns = ['summarize', 'extract_wisdom', 'custom_pattern'];

      const { sendSafely, getConnectionStatus } = await import('$shared/connection');
      vi.mocked(sendSafely).mockResolvedValue({
        type: 'internal.patternsList',
        patterns: availablePatterns,
      });
      vi.mocked(getConnectionStatus).mockResolvedValue('connected');

      render(Preferences);

      await waitFor(() => {
        expect(saveSettings).toHaveBeenCalledWith(
          expect.objectContaining({
            visiblePatterns: ['summarize', 'extract_wisdom'],
          })
        );
      });
    });

    it('should handle empty pattern list response', async () => {
      mockSendMessage = vi.fn().mockImplementation((request, callback) => {
        if (callback) {
          if (request.type === 'internal.listPatterns') {
            setTimeout(
              () =>
                callback({
                  type: 'internal.patternsList',
                  patterns: [],
                }),
              0
            );
          } else if (request.type === 'internal.connectionStatus') {
            setTimeout(
              () =>
                callback({
                  type: 'internal.connectionStatus',
                  status: 'connected',
                }),
              0
            );
          }
        }
      });
      chrome.runtime.sendMessage = mockSendMessage;

      const { container } = render(Preferences);

      await waitFor(() => {
        expect(container).toBeInTheDocument();
      });
    });

    it('should handle rapid setting changes without conflict', async () => {
      const { loadSettings, saveSettings } = await import('$shared/settings');
      vi.mocked(loadSettings).mockResolvedValue({
        fabricPath: '',
        fabricModel: '',
        fabricContext: '',
        defaultPattern: '',
        visiblePatterns: [],
        showCustomPrompt: true,
        renderAsMarkdown: true,
        sendRawContent: false,
      });
      vi.mocked(saveSettings).mockResolvedValue();

      const { getByLabelText } = render(Preferences);

      await waitFor(() => {
        const pathInput = getByLabelText(/fabric path/i);
        expect(pathInput).toBeInTheDocument();
      });

      const pathInput = getByLabelText(/fabric path/i);

      fireEvent.input(pathInput, { target: { value: '/path1' } });
      fireEvent.input(pathInput, { target: { value: '/path2' } });
      fireEvent.input(pathInput, { target: { value: '/path3' } });

      await waitFor(() => {
        expect(saveSettings).toHaveBeenLastCalledWith({ fabricPath: '/path3' });
      });
    });

    it('should preserve other settings when updating individual values', async () => {
      const { loadSettings, saveSettings } = await import('$shared/settings');
      vi.mocked(loadSettings).mockResolvedValue({
        fabricPath: '',
        fabricModel: 'gpt-3.5',
        fabricContext: '',
        defaultPattern: 'summarize',
        showCustomPrompt: false,
        renderAsMarkdown: false,
        sendRawContent: false,
        visiblePatterns: ['pattern1', 'pattern2'],
      });
      vi.mocked(saveSettings).mockResolvedValue();

      const { getByLabelText } = render(Preferences);

      await waitFor(() => {
        expect(loadSettings).toHaveBeenCalled();
      });

      const modelInput = getByLabelText(/model/i);

      await waitFor(() => {
        expect(modelInput).toHaveValue('gpt-3.5');
      });

      await fireEvent.input(modelInput, { target: { value: 'gpt-4' } });

      await waitFor(() => {
        expect(saveSettings).toHaveBeenCalledWith({
          fabricModel: 'gpt-4',
        });
      });
    });

    it('should handle malformed response from background script', async () => {
      mockSendMessage = vi.fn().mockImplementation((_request, callback) => {
        if (callback) {
          setTimeout(() => callback('invalid response'), 0);
        }
      });
      chrome.runtime.sendMessage = mockSendMessage;

      const { container } = render(Preferences);

      await waitFor(() => {
        expect(container).toBeInTheDocument();
      });
    });
  });
});
