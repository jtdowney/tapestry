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
      type: 'internal.patternsList',
      patterns: ['summarize', 'pattern1', 'pattern2'],
    });

    const { sendSafely, getConnectionStatus, addConnectionListener, removeConnectionListener } =
      await import('$shared/connection');
    vi.mocked(sendSafely).mockResolvedValue({
      type: 'internal.patternsList',
      patterns: ['summarize', 'pattern1', 'pattern2'],
    });
    vi.mocked(getConnectionStatus).mockResolvedValue('connected');
    vi.mocked(addConnectionListener).mockImplementation(() => {});
    vi.mocked(removeConnectionListener).mockImplementation(() => {});

    const { loadSettings } = await import('$shared/settings');
    vi.mocked(loadSettings).mockResolvedValue({
      fabricPath: '',
      fabricModel: '',
      fabricContext: '',
      defaultPattern: 'summarize',
      visiblePatterns: ['summarize', 'pattern1', 'pattern2'],
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
                type: 'internal.patternsList',
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
        type: 'internal.patternsList',
        patterns: ['pattern1', 'pattern2'],
      });

      render(Sidebar);

      await waitFor(() => {
        expect(sendSafely).toHaveBeenCalledWith({ type: 'internal.listPatterns' });
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
        type: 'internal.patternsList',
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
        type: 'internal.patternsList',
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
        type: 'internal.patternsList',
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
        type: 'internal.patternsList',
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
      const { container, getByRole } = render(Sidebar);

      // Wait for component to load and set up with a non-custom pattern
      await waitFor(() => {
        const select = container.querySelector('select') as HTMLSelectElement;
        expect(select?.value).toBe('summarize');
      });

      // Mock page capture response
      const { sendSafely } = await import('$shared/connection');
      vi.mocked(sendSafely).mockResolvedValueOnce({
        type: 'internal.pageContent',
        content: 'Test page content',
      });

      // Mock processContent to return undefined to keep processing
      vi.mocked(sendSafely).mockResolvedValueOnce(undefined);

      // Click Go to start processing
      const goButton = getByRole('button', { name: /go/i });
      await fireEvent.click(goButton);

      // Now send processing content message with matching ID
      // We need to extract the request ID that was generated
      const calls = vi.mocked(sendSafely).mock.calls;
      const processCall = calls.find((call) => call[0]?.type === 'internal.processContent');
      const requestId = (processCall?.[0] as any)?.id;

      messageListeners.forEach((listener) =>
        listener({
          type: 'internal.processingContent',
          id: requestId,
          content: 'New content chunk',
        })
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

      // Mock page capture response
      const { sendSafely } = await import('$shared/connection');
      vi.mocked(sendSafely).mockResolvedValueOnce({
        type: 'internal.pageContent',
        content: 'Test page content',
      });

      // Mock processContent to return undefined to keep processing
      vi.mocked(sendSafely).mockResolvedValueOnce(undefined);

      const goButton = getByRole('button', { name: /go/i });
      await fireEvent.click(goButton);

      // Extract the request ID
      const calls = vi.mocked(sendSafely).mock.calls;
      const processCall = calls.find((call) => call[0]?.type === 'internal.processContent');
      const requestId = (processCall?.[0] as any)?.id;

      messageListeners.forEach((listener) =>
        listener({ type: 'internal.processingDone', id: requestId })
      );

      await waitFor(() => {
        expect(getByRole('button', { name: /go/i })).not.toBeDisabled();
      });
    });

    it('should handle processing_error messages', async () => {
      const { container } = render(Sidebar);

      messageListeners.forEach((listener) =>
        listener({ type: 'internal.processingError', message: 'Test error' })
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
        type: 'internal.patternsList',
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
        type: 'internal.patternsList',
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
        type: 'internal.patternsList',
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
        defaultPattern: 'summarize',
        visiblePatterns: ['summarize'],
        showCustomPrompt: true,
        renderAsMarkdown: true,
        sendRawContent: false,
      });

      const { sendSafely } = await import('$shared/connection');
      vi.mocked(sendSafely).mockResolvedValueOnce({
        type: 'internal.patternsList',
        patterns: ['summarize'],
      });

      const { container, getByRole } = render(Sidebar);

      // Wait for patterns to load
      await waitFor(() => {
        const select = container.querySelector('select') as HTMLSelectElement;
        expect(select?.value).toBe('summarize');
      });

      // Mock page capture and start processing
      vi.mocked(sendSafely).mockResolvedValueOnce({
        type: 'internal.pageContent',
        content: 'Test page content',
      });
      vi.mocked(sendSafely).mockResolvedValueOnce(undefined);

      const goButton = getByRole('button', { name: /go/i });
      await fireEvent.click(goButton);

      // Extract request ID and send content
      const calls = vi.mocked(sendSafely).mock.calls;
      const processCall = calls.find((call) => call[0]?.type === 'internal.processContent');
      const requestId = (processCall?.[0] as any)?.id;

      messageListeners.forEach((listener) =>
        listener({ type: 'internal.processingContent', id: requestId, content: '# Test Header' })
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
        defaultPattern: 'summarize',
        visiblePatterns: ['summarize'],
        showCustomPrompt: true,
        renderAsMarkdown: false,
        sendRawContent: false,
      });

      const { sendSafely } = await import('$shared/connection');
      vi.mocked(sendSafely).mockResolvedValueOnce({
        type: 'internal.patternsList',
        patterns: ['summarize'],
      });

      const { container, getByRole } = render(Sidebar);

      // Wait for patterns to load
      await waitFor(() => {
        const select = container.querySelector('select') as HTMLSelectElement;
        expect(select?.value).toBe('summarize');
      });

      // Mock page capture and start processing
      vi.mocked(sendSafely).mockResolvedValueOnce({
        type: 'internal.pageContent',
        content: 'Test page content',
      });
      vi.mocked(sendSafely).mockResolvedValueOnce(undefined);

      const goButton = getByRole('button', { name: /go/i });
      await fireEvent.click(goButton);

      // Extract request ID and send content
      const calls = vi.mocked(sendSafely).mock.calls;
      const processCall = calls.find((call) => call[0]?.type === 'internal.processContent');
      const requestId = (processCall?.[0] as any)?.id;

      messageListeners.forEach((listener) =>
        listener({ type: 'internal.processingContent', id: requestId, content: '# Test Header' })
      );

      await waitFor(() => {
        expect(container.innerHTML).toContain('# Test Header');
      });
    });

    it('should show cancel button when processing', async () => {
      const { container } = render(Sidebar);

      // Wait for component to fully load patterns and select the default pattern
      await waitFor(
        () => {
          const select = container.querySelector('select') as HTMLSelectElement;
          expect(select).toBeTruthy();

          // Wait for patterns to be loaded and default pattern to be selected
          const options = Array.from(select.options);
          const hasSummarize = options.some((option) => option.value === 'summarize');
          expect(hasSummarize).toBe(true);

          // Component should automatically select 'summarize' as the default pattern
          expect(select.value).toBe('summarize');
        },
        { timeout: 3000 }
      );

      // The Go button should be enabled since summarize is a valid non-custom pattern
      await waitFor(
        () => {
          const buttons = Array.from(container.querySelectorAll('button'));
          const goButton = buttons.find((btn) => btn.textContent?.includes('Go'));
          expect(goButton).toBeTruthy();
          expect(goButton?.hasAttribute('disabled')).toBe(false);
        },
        { timeout: 3000 }
      );

      // Mock the page capture response to trigger processing state
      const mockSendSafely = vi.mocked((await import('$shared/connection')).sendSafely);
      mockSendSafely.mockResolvedValueOnce({
        type: 'internal.pageContent',
        content: 'Test page content',
      });

      // Mock the second call (processContent) to return undefined to keep processing
      mockSendSafely.mockResolvedValueOnce(undefined);

      // Click Go to start processing
      const buttons = Array.from(container.querySelectorAll('button'));
      const goButton = buttons.find((btn) => btn.textContent?.includes('Go'));
      await fireEvent.click(goButton!);

      await waitFor(() => {
        // Should show cancel button now that processing has started
        const buttonsAfter = Array.from(container.querySelectorAll('button'));
        const cancelButton = buttonsAfter.find((btn) => btn.textContent?.includes('Cancel'));
        expect(cancelButton).toBeTruthy();
        expect(cancelButton?.textContent).toContain('Cancel');

        // Go button should not be visible during processing
        const goButtonAfter = buttonsAfter.find((btn) => btn.textContent?.includes('Go'));
        expect(goButtonAfter).toBeFalsy();
      });
    });

    it('should handle cancel button click', async () => {
      const mockSendSafely = vi.mocked((await import('$shared/connection')).sendSafely);

      const { container } = render(Sidebar);

      // Wait for component to fully load patterns and select the default pattern
      await waitFor(
        () => {
          const select = container.querySelector('select') as HTMLSelectElement;
          expect(select).toBeTruthy();
          expect(select.value).toBe('summarize');
        },
        { timeout: 3000 }
      );

      // The Go button should be enabled
      await waitFor(
        () => {
          const buttons = Array.from(container.querySelectorAll('button'));
          const goButton = buttons.find((btn) => btn.textContent?.includes('Go'));
          expect(goButton).toBeTruthy();
          expect(goButton?.hasAttribute('disabled')).toBe(false);
        },
        { timeout: 3000 }
      );

      // Mock page capture response first
      mockSendSafely.mockResolvedValueOnce({
        type: 'internal.pageContent',
        content: 'Test page content',
      });

      // Mock processContent to return undefined to keep processing
      mockSendSafely.mockResolvedValueOnce(undefined);

      // Mock cancel response
      mockSendSafely.mockResolvedValueOnce({
        type: 'internal.processingCancelled',
        id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      });

      // Click Go to start processing
      const buttons = Array.from(container.querySelectorAll('button'));
      const goButton = buttons.find((btn) => btn.textContent?.includes('Go'));
      await fireEvent.click(goButton!);

      await waitFor(async () => {
        const buttonsAfter = Array.from(container.querySelectorAll('button'));
        const cancelButton = buttonsAfter.find((btn) => btn.textContent?.includes('Cancel'));
        expect(cancelButton).toBeTruthy();

        // Click the cancel button
        await fireEvent.click(cancelButton!);

        // Should call sendSafely with cancel request
        expect(mockSendSafely).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'internal.cancelProcess',
            requestId: expect.any(String),
          })
        );
      });
    });

    it('should update UI state when cancel succeeds', async () => {
      const mockSendSafely = vi.mocked((await import('$shared/connection')).sendSafely);

      const { container } = render(Sidebar);

      // Wait for component to fully load patterns and select the default pattern
      await waitFor(
        () => {
          const select = container.querySelector('select') as HTMLSelectElement;
          expect(select).toBeTruthy();
          expect(select.value).toBe('summarize');
        },
        { timeout: 3000 }
      );

      // The Go button should be enabled
      await waitFor(
        () => {
          const buttons = Array.from(container.querySelectorAll('button'));
          const goButton = buttons.find((btn) => btn.textContent?.includes('Go'));
          expect(goButton).toBeTruthy();
          expect(goButton?.hasAttribute('disabled')).toBe(false);
        },
        { timeout: 3000 }
      );

      // Mock page capture response
      mockSendSafely.mockResolvedValueOnce({
        type: 'internal.pageContent',
        content: 'Test page content',
      });

      // Mock processContent to return undefined to keep processing
      mockSendSafely.mockResolvedValueOnce(undefined);

      // Click Go to start processing
      const buttons = Array.from(container.querySelectorAll('button'));
      const goButton = buttons.find((btn) => btn.textContent?.includes('Go'));
      await fireEvent.click(goButton!);

      // Wait for Cancel button to appear
      await waitFor(() => {
        const buttonsAfter = Array.from(container.querySelectorAll('button'));
        const cancelButton = buttonsAfter.find((btn) => btn.textContent?.includes('Cancel'));
        expect(cancelButton).toBeTruthy();
      });

      // Mock cancel response
      mockSendSafely.mockResolvedValueOnce({
        type: 'internal.processingCancelled',
        id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      });

      // Click the cancel button
      const buttonsAfter = Array.from(container.querySelectorAll('button'));
      const cancelButton = buttonsAfter.find((btn) => btn.textContent?.includes('Cancel'));
      await fireEvent.click(cancelButton!);

      // Should show cancellation message and reset state
      await waitFor(() => {
        expect(container.textContent).toContain('Process was cancelled');

        // Cancel button should be gone, Go button should be back
        const buttonsAfterCancel = Array.from(container.querySelectorAll('button'));
        const cancelButtonAfter = buttonsAfterCancel.find((btn) =>
          btn.textContent?.includes('Cancel')
        );
        expect(cancelButtonAfter).toBeFalsy();

        const goButtonAfter = buttonsAfterCancel.find((btn) => btn.textContent?.includes('Go'));
        expect(goButtonAfter).toBeTruthy();
      });
    });

    it('should handle cancel failure', async () => {
      const mockSendSafely = vi.mocked((await import('$shared/connection')).sendSafely);

      const { container } = render(Sidebar);

      // Wait for component to fully load patterns and select the default pattern
      await waitFor(
        () => {
          const select = container.querySelector('select') as HTMLSelectElement;
          expect(select).toBeTruthy();
          expect(select.value).toBe('summarize');
        },
        { timeout: 3000 }
      );

      // The Go button should be enabled
      await waitFor(
        () => {
          const buttons = Array.from(container.querySelectorAll('button'));
          const goButton = buttons.find((btn) => btn.textContent?.includes('Go'));
          expect(goButton).toBeTruthy();
          expect(goButton?.hasAttribute('disabled')).toBe(false);
        },
        { timeout: 3000 }
      );

      // Mock page capture response
      mockSendSafely.mockResolvedValueOnce({
        type: 'internal.pageContent',
        content: 'Test page content',
      });

      // Mock processContent to return undefined to keep processing
      mockSendSafely.mockResolvedValueOnce(undefined);

      // Click Go to start processing
      const buttons = Array.from(container.querySelectorAll('button'));
      const goButton = buttons.find((btn) => btn.textContent?.includes('Go'));
      await fireEvent.click(goButton!);

      // Wait for Cancel button to appear
      await waitFor(() => {
        const buttonsAfter = Array.from(container.querySelectorAll('button'));
        const cancelButton = buttonsAfter.find((btn) => btn.textContent?.includes('Cancel'));
        expect(cancelButton).toBeTruthy();
      });

      // Mock cancel error response
      mockSendSafely.mockResolvedValueOnce({
        type: 'internal.processingError',
        message: 'Cancel failed',
      });

      // Click the cancel button
      const buttonsAfter = Array.from(container.querySelectorAll('button'));
      const cancelButton = buttonsAfter.find((btn) => btn.textContent?.includes('Cancel'));
      await fireEvent.click(cancelButton!);

      // Should show error message
      await waitFor(() => {
        expect(container.textContent).toContain('Failed to cancel: Cancel failed');
      });
    });
  });
});
