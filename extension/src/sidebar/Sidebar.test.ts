import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import Sidebar from './Sidebar.svelte';

vi.mock('$shared/constants', () => ({
  RECOMMENDED_PATTERNS: ['summarize', 'extract_wisdom', 'create_summary'],
}));

vi.mock('$shared/settings', () => ({
  loadSettings: vi.fn(),
  watchSettings: vi.fn(() => vi.fn()),
}));

vi.mock('$shared/connection', () => ({
  sendSafely: vi.fn(),
  getConnectionStatus: vi.fn(),
  addConnectionListener: vi.fn(),
  removeConnectionListener: vi.fn(),
  _resetConnectionState: vi.fn(),
}));

describe('Sidebar Component', () => {
  let mockSendMessage: ReturnType<typeof vi.fn>;
  let messageListeners: any[];
  let storageListeners: any[];

  const createMockSendMessage = (response: any) => {
    return vi.fn().mockResolvedValue(response);
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    messageListeners = [];
    storageListeners = [];

    mockSendMessage = vi.fn().mockResolvedValue({
      type: 'internal.patterns_list',
      patterns: ['pattern1', 'pattern2'],
    });

    const { sendSafely, getConnectionStatus, addConnectionListener, removeConnectionListener } =
      await import('$shared/connection');
    vi.mocked(sendSafely).mockResolvedValue({
      type: 'internal.patterns_list',
      patterns: ['pattern1', 'pattern2'],
    });
    vi.mocked(getConnectionStatus).mockResolvedValue('connected');
    vi.mocked(addConnectionListener).mockImplementation(() => {});
    vi.mocked(removeConnectionListener).mockImplementation(() => {});

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

    Object.assign(globalThis.chrome, {
      runtime: {
        sendMessage: mockSendMessage,
        onMessage: {
          addListener: vi.fn((listener) => messageListeners.push(listener)),
          removeListener: vi.fn(),
        },
      },
      storage: {
        onChanged: {
          addListener: vi.fn((listener) => storageListeners.push(listener)),
          removeListener: vi.fn(),
        },
      },
    });
  });

  describe('Component Initialization', () => {
    it('should render with initial state', async () => {
      mockSendMessage.mockImplementation((_request, callback) => {
        if (callback) {
          setTimeout(
            () =>
              callback({
                type: 'internal.patterns_list',
                patterns: ['pattern1', 'pattern2'],
              }),
            0
          );
        }
      });

      const { getByText } = render(Sidebar);

      await waitFor(() => {
        expect(getByText('Click "Go" to process the current page with Fabric')).toBeInTheDocument();
      });
    });

    it('should load patterns on mount', async () => {
      const { sendSafely } = await import('$shared/connection');
      vi.mocked(sendSafely).mockResolvedValue({
        type: 'internal.patterns_list',
        patterns: ['pattern1', 'pattern2'],
      });

      render(Sidebar);

      await waitFor(() => {
        expect(sendSafely).toHaveBeenCalledWith({ type: 'internal.list_patterns' });
      });
    });

    it('should load settings from storage on mount', async () => {
      const { loadSettings } = await import('$shared/settings');
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

      render(Sidebar);

      await waitFor(() => {
        expect(loadSettings).toHaveBeenCalled();
      });
    });
  });

  describe('Pattern Management', () => {
    it('should filter patterns based on visibility settings', async () => {
      const { sendSafely } = await import('$shared/connection');
      vi.mocked(sendSafely).mockResolvedValue({
        type: 'internal.patterns_list',
        patterns: ['pattern1', 'pattern2', 'pattern3'],
      });

      const { loadSettings } = await import('$shared/settings');
      vi.mocked(loadSettings).mockResolvedValue({
        fabricPath: '',
        fabricModel: '',
        fabricContext: '',
        defaultPattern: '',
        visiblePatterns: ['pattern1', 'pattern3'],
        showCustomPrompt: true,
        renderAsMarkdown: true,
        sendRawContent: false,
      });

      const { container } = render(Sidebar);

      await waitFor(() => {
        const select = container.querySelector('select');
        const options = Array.from(select?.options || []).map((opt) => opt.value);
        expect(options).toContain('pattern1');
        expect(options).toContain('pattern3');
        expect(options).not.toContain('pattern2');
      });
    });

    it('should set default pattern when specified in settings', async () => {
      const { sendSafely } = await import('$shared/connection');
      vi.mocked(sendSafely).mockResolvedValue({
        type: 'internal.patterns_list',
        patterns: ['pattern1', 'pattern2'],
      });

      const { loadSettings } = await import('$shared/settings');
      vi.mocked(loadSettings).mockResolvedValue({
        fabricPath: '',
        fabricModel: '',
        fabricContext: '',
        defaultPattern: 'pattern2',
        visiblePatterns: ['pattern1', 'pattern2'],
        showCustomPrompt: true,
        renderAsMarkdown: true,
        sendRawContent: false,
      });

      const { container } = render(Sidebar);

      await waitFor(() => {
        const select = container.querySelector('select') as HTMLSelectElement;
        expect(select?.value).toBe('pattern2');
      });
    });

    it('should show Custom option when showCustomPrompt is true', async () => {
      const { sendSafely } = await import('$shared/connection');
      vi.mocked(sendSafely).mockResolvedValue({
        type: 'internal.patterns_list',
        patterns: ['pattern1'],
      });

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

      const { container } = render(Sidebar);

      await waitFor(() => {
        const select = container.querySelector('select');
        const options = Array.from(select?.options || []).map((opt) => opt.value);
        expect(options).toContain('Custom');
      });
    });

    it('should hide Custom option when showCustomPrompt is false', async () => {
      const { sendSafely } = await import('$shared/connection');
      vi.mocked(sendSafely).mockResolvedValue({
        type: 'internal.patterns_list',
        patterns: ['pattern1'],
      });

      const { loadSettings } = await import('$shared/settings');
      vi.mocked(loadSettings).mockResolvedValue({
        fabricPath: '',
        fabricModel: '',
        fabricContext: '',
        defaultPattern: '',
        visiblePatterns: ['pattern1'],
        showCustomPrompt: false,
        renderAsMarkdown: true,
        sendRawContent: false,
      });

      const { container } = render(Sidebar);

      await waitFor(() => {
        const select = container.querySelector('select');
        const options = Array.from(select?.options || []).map((opt) => opt.value);
        expect(options).not.toContain('Custom');
      });
    });
  });

  describe('Message Handling', () => {
    it('should handle processing_content messages', async () => {
      const { container } = render(Sidebar);

      messageListeners.forEach((listener) =>
        listener({ type: 'internal.processing_content', content: 'New content chunk' })
      );

      await waitFor(() => {
        expect(container.textContent).toContain('New content chunk');
      });
    });

    it('should handle processing_done messages', async () => {
      const { getByRole, getByPlaceholderText } = render(Sidebar);

      const customInput = getByPlaceholderText('Enter your custom prompt...');
      await fireEvent.input(customInput, { target: { value: 'test prompt' } });

      await waitFor(() => {
        expect(getByRole('button', { name: /go/i })).not.toBeDisabled();
      });

      const goButton = getByRole('button', { name: /go/i });
      await fireEvent.click(goButton);

      messageListeners.forEach((listener) => listener({ type: 'internal.processing_done' }));

      await waitFor(() => {
        expect(getByRole('button', { name: /go/i })).not.toBeDisabled();
      });
    });

    it('should handle processing_error messages', async () => {
      const { container } = render(Sidebar);

      messageListeners.forEach((listener) =>
        listener({ type: 'internal.processing_error', message: 'Test error' })
      );

      await waitFor(() => {
        expect(container.textContent).toContain('Test error');
      });
    });
  });

  describe('Storage Change Handling', () => {
    it('should update showCustomPrompt when storage changes', async () => {
      let watchSettingsCallback: any;
      const { watchSettings } = await import('$shared/settings');
      vi.mocked(watchSettings).mockImplementation((callback) => {
        watchSettingsCallback = callback;
        return vi.fn();
      });

      const { sendSafely } = await import('$shared/connection');
      vi.mocked(sendSafely).mockResolvedValue({
        type: 'internal.patterns_list',
        patterns: ['pattern1'],
      });

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

      const { container } = render(Sidebar);

      await waitFor(() => {
        const select = container.querySelector('select');
        const options = Array.from(select?.options || []).map((opt) => opt.value);
        expect(options).toContain('Custom');
      });

      if (watchSettingsCallback) {
        watchSettingsCallback({ showCustomPrompt: { newValue: false } }, 'local');
      }

      await waitFor(() => {
        const select = container.querySelector('select');
        const options = Array.from(select?.options || []).map((opt) => opt.value);
        expect(options).not.toContain('Custom');
      });
    });

    it('should switch away from Custom pattern when disabled', async () => {
      let watchSettingsCallback: any;
      const { watchSettings } = await import('$shared/settings');
      vi.mocked(watchSettings).mockImplementation((callback) => {
        watchSettingsCallback = callback;
        return vi.fn();
      });

      const { sendSafely } = await import('$shared/connection');
      vi.mocked(sendSafely).mockResolvedValue({
        type: 'internal.patterns_list',
        patterns: ['pattern1'],
      });

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

      const { container } = render(Sidebar);

      await waitFor(() => {
        const select = container.querySelector('select');
        const options = Array.from(select?.options || []).map((opt) => opt.value);
        expect(options).toContain('Custom');
        expect(options).toContain('pattern1');
      });

      const select = container.querySelector('select') as HTMLSelectElement;
      select.value = 'Custom';
      select.dispatchEvent(new Event('change'));

      expect(select.value).toBe('Custom');

      if (watchSettingsCallback) {
        watchSettingsCallback({ showCustomPrompt: { newValue: false } }, 'local');
      }

      await waitFor(() => {
        const select = container.querySelector('select') as HTMLSelectElement;
        expect(select.value).toBe('pattern1');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle pattern loading errors gracefully', async () => {
      const { sendSafely } = await import('$shared/connection');
      vi.mocked(sendSafely).mockRejectedValue(new Error('Failed to load patterns'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(Sidebar);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to load patterns:', expect.any(Error));
      });

      consoleSpy.mockRestore();
    });

    it('should handle missing storage settings gracefully', async () => {
      mockSendMessage = createMockSendMessage({
        type: 'internal.patterns_list',
        patterns: ['pattern1'],
      });
      chrome.runtime.sendMessage = mockSendMessage;
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

      const { container } = render(Sidebar);

      await waitFor(() => {
        expect(container).toBeTruthy();
      });
    });
  });

  describe('Rendering Modes', () => {
    it('should render as markdown when renderAsMarkdown is true', async () => {
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

      const { container } = render(Sidebar);

      messageListeners.forEach((listener) =>
        listener({ type: 'internal.processing_content', content: '# Test Header' })
      );

      await waitFor(() => {
        const markdownOutput = container.querySelector('.prose');
        expect(markdownOutput).toBeInTheDocument();
      });
    });

    it('should render as plain text when renderAsMarkdown is false', async () => {
      const { loadSettings } = await import('$shared/settings');
      vi.mocked(loadSettings).mockResolvedValue({
        fabricPath: '',
        fabricModel: '',
        fabricContext: '',
        defaultPattern: '',
        visiblePatterns: [],
        showCustomPrompt: true,
        renderAsMarkdown: false,
        sendRawContent: false,
      });

      const { container } = render(Sidebar);

      messageListeners.forEach((listener) =>
        listener({ type: 'internal.processing_content', content: '# Test Header' })
      );

      await waitFor(() => {
        expect(container.innerHTML).toContain('# Test Header');
      });
    });
  });
});
