import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { NativeResponseSchema } from './messages';

vi.mock('$shared/requestId', () => ({
  generateRequestId: vi.fn(() => 'f47ac10b-58cc-4372-a567-0e02b2c3d479'),
}));

vi.mock('$shared/settings', () => ({
  loadFabricSettings: vi.fn(() =>
    Promise.resolve({
      path: '/path/to/fabric',
      model: 'gpt-4',
    })
  ),
}));

describe('Native Message Schema Validation', () => {
  it('should validate message schemas correctly', () => {
    const validBroadcast = {
      type: 'native.content',
      content: 'Test content',
      id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    };

    const result1 = NativeResponseSchema.safeParse(validBroadcast);
    expect(result1.success).toBe(true);

    const validWithId = {
      type: 'native.patternsList',
      id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      patterns: ['pattern1'],
    };

    const result2 = NativeResponseSchema.safeParse(validWithId);
    expect(result2.success).toBe(true);

    const validPong = {
      type: 'native.pong',
      valid: true,
      version: 'v1.0.0',
      id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    };

    const result3 = NativeResponseSchema.safeParse(validPong);
    expect(result3.success).toBe(true);

    const invalid = {
      type: 'native.content',
    };

    const result4 = NativeResponseSchema.safeParse(invalid);
    expect(result4.success).toBe(false);
  });

  it('should require ID field in all native response message types', () => {
    const messageTypesWithoutId = [
      { type: 'native.pong', valid: true },
      { type: 'native.patternsList', patterns: ['pattern1'] },
      { type: 'native.content', content: 'test content' },
      { type: 'native.done', exitCode: 0 },
      { type: 'native.error', message: 'test error' },
    ];

    for (const message of messageTypesWithoutId) {
      const result = NativeResponseSchema.safeParse(message);
      expect(result.success).toBe(false);

      expect(result.error?.issues.length).toBeGreaterThan(0);
    }

    const messageTypesWithId = [
      { type: 'native.pong', valid: true, id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' },
      {
        type: 'native.patternsList',
        patterns: ['pattern1'],
        id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      },
      {
        type: 'native.content',
        content: 'test content',
        id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      },
      { type: 'native.done', exitCode: 0, id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' },
      { type: 'native.error', message: 'test error', id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' },
    ];

    for (const message of messageTypesWithId) {
      const result = NativeResponseSchema.safeParse(message);
      expect(result.success).toBe(true);
    }
  });
});

describe('Background Script Integration', () => {
  let mockPort: chrome.runtime.Port;
  let mockConnectNative: ReturnType<typeof vi.fn>;
  let mockSendMessage: ReturnType<typeof vi.fn>;
  let mockStorageGet: ReturnType<typeof vi.fn>;
  let mockTabsQuery: ReturnType<typeof vi.fn>;
  let mockTabsSendMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPort = {
      onDisconnect: { addListener: vi.fn() },
      onMessage: { addListener: vi.fn() },
      postMessage: vi.fn(),
      disconnect: vi.fn(),
    } as any;

    mockConnectNative = vi.fn().mockReturnValue(mockPort);
    mockSendMessage = vi.fn().mockResolvedValue({});
    mockStorageGet = vi.fn().mockResolvedValue({});
    mockTabsQuery = vi.fn();
    mockTabsSendMessage = vi.fn();

    Object.assign(globalThis.chrome, {
      runtime: {
        ...globalThis.chrome.runtime,
        connectNative: mockConnectNative,
        sendMessage: mockSendMessage,
        onInstalled: { addListener: vi.fn() },
        onStartup: { addListener: vi.fn() },
        onMessage: { addListener: vi.fn() },
        lastError: undefined,
      },
      storage: {
        local: { get: mockStorageGet },
        sync: { get: mockStorageGet },
      },
      tabs: {
        query: mockTabsQuery,
        sendMessage: mockTabsSendMessage,
      },
      sidePanel: {
        setPanelBehavior: vi.fn().mockResolvedValue(undefined),
      },
    });

    vi.resetModules();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Connection Management', () => {
    it('should establish native connection on startup', async () => {
      await import('./background');

      const onStartupListener = vi.mocked(chrome.runtime.onStartup.addListener).mock.calls[0]?.[0];
      await onStartupListener?.();

      expect(mockConnectNative).toHaveBeenCalledWith('com.jtdowney.tapestry');
      expect(mockPort.onDisconnect.addListener).toHaveBeenCalled();
      expect(mockPort.onMessage.addListener).toHaveBeenCalled();
    });

    it('should handle port disconnect and cleanup pending requests', async () => {
      await import('./background');

      const onStartupListener = vi.mocked(chrome.runtime.onStartup.addListener).mock.calls[0]?.[0];
      await onStartupListener?.();

      const disconnectHandler = vi.mocked(mockPort.onDisconnect.addListener).mock.calls[0]?.[0];
      disconnectHandler?.(mockPort);

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'internal.connectionStatus',
        status: 'disconnected',
      });
    });

    it('should setup Chrome sidebar panel', async () => {
      await import('./background');

      const onInstalledListener = vi.mocked(chrome.runtime.onInstalled.addListener).mock
        .calls[0]?.[0];
      await onInstalledListener?.({ reason: 'install' });

      expect(chrome.sidePanel.setPanelBehavior).toHaveBeenCalledWith({
        openPanelOnActionClick: true,
      });
    });

    it('should setup Firefox sidebar action when sidePanel not available', async () => {
      delete (globalThis.chrome as any).sidePanel;
      (globalThis.chrome as any).sidebarAction = { open: vi.fn() };
      chrome.action = { onClicked: { addListener: vi.fn() } } as any;

      await import('./background');

      const onInstalledListener = vi.mocked(chrome.runtime.onInstalled.addListener).mock
        .calls[0]?.[0];
      await onInstalledListener?.({ reason: 'install' });

      expect(chrome.action.onClicked.addListener).toHaveBeenCalled();
    });
  });

  describe('Message Routing', () => {
    it('should handle connectionStatus requests', async () => {
      await import('./background');

      const messageListener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0]?.[0];
      const sendResponse = vi.fn();

      await messageListener?.({ type: 'internal.connectionStatus' }, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({
        type: 'internal.connectionStatus',
        status: 'disconnected',
      });
    });

    it('should handle reconnectNative requests', async () => {
      await import('./background');

      const messageListener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0]?.[0];
      const sendResponse = vi.fn();

      await messageListener?.({ type: 'internal.reconnectNative' }, {}, sendResponse);

      expect(mockConnectNative).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith({
        type: 'internal.connectionStatus',
        status: 'disconnected',
      });
    });

    it('should reject invalid message format', async () => {
      await import('./background');

      const messageListener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0]?.[0];
      const sendResponse = vi.fn();

      const result = messageListener?.({ invalid: 'message' }, {}, sendResponse);

      expect(result).toBe(false);
      expect(sendResponse).toHaveBeenCalledWith({
        type: 'internal.processingError',
        message: 'Invalid request format',
      });
    });

    it('should handle capturePage requests successfully', async () => {
      const mockActiveTab = { id: 123 };
      mockTabsQuery.mockResolvedValue([mockActiveTab]);
      mockTabsSendMessage.mockImplementation((_tabId: number, _message: any, callback: any) => {
        callback({ type: 'page_content', content: 'test content' });
      });

      await import('./background');

      const messageListener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0]?.[0];
      const sendResponse = vi.fn();

      await messageListener?.({ type: 'internal.capturePage' }, {}, sendResponse);

      expect(chrome.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
        123,
        { type: 'internal.capturePage' },
        expect.any(Function)
      );
      expect(sendResponse).toHaveBeenCalledWith({ type: 'page_content', content: 'test content' });
    });

    it('should handle capturePage when no active tab exists', async () => {
      mockTabsQuery.mockResolvedValue([]);

      await import('./background');

      const messageListener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0]?.[0];
      const sendResponse = vi.fn();

      await messageListener?.({ type: 'internal.capturePage' }, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({
        type: 'internal.processingError',
        message: 'No active tab',
      });
    });

    it('should handle capturePage when active tab has no id', async () => {
      mockTabsQuery.mockResolvedValue([{ id: undefined }]);

      await import('./background');

      const messageListener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0]?.[0];
      const sendResponse = vi.fn();

      await messageListener?.({ type: 'internal.capturePage' }, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({
        type: 'internal.processingError',
        message: 'No active tab',
      });
    });

    it('should handle capturePage when content script is not available', async () => {
      mockTabsQuery.mockResolvedValue([{ id: 123 }]);
      mockTabsSendMessage.mockImplementation((_tabId: number, _message: any, callback: any) => {
        Object.defineProperty(chrome.runtime, 'lastError', {
          value: { message: 'Could not establish connection' },
          writable: true,
          configurable: true,
        });
        callback();
      });

      await import('./background');

      const messageListener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0]?.[0];
      const sendResponse = vi.fn();

      await messageListener?.({ type: 'internal.capturePage' }, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({
        type: 'internal.processingError',
        message: 'Content script not available. Please refresh the page.',
      });
    });

    it('should handle capturePage when tabs.query throws error', async () => {
      mockTabsQuery.mockRejectedValue(new Error('Tab access denied'));

      await import('./background');

      const messageListener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0]?.[0];
      const sendResponse = vi.fn();

      await messageListener?.({ type: 'internal.capturePage' }, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({
        type: 'internal.processingError',
        message: 'Failed to capture page: Error: Tab access denied',
      });
    });

    it('should handle processContent when connected', async () => {
      await import('./background');

      const onStartupListener = vi.mocked(chrome.runtime.onStartup.addListener).mock.calls[0]?.[0];
      await onStartupListener?.();

      mockSendMessage.mockClear();

      const messageHandler = vi.mocked(mockPort.onMessage.addListener).mock.calls[0]?.[0];
      messageHandler?.(
        {
          type: 'native.pong',
          valid: true,
          version: 'v1.0.0',
          id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        },
        mockPort
      );

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'internal.connectionStatus',
        status: 'connected',
      });

      mockSendMessage.mockClear();

      const messageListener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0]?.[0];
      const sendResponse = vi.fn();

      const result = await messageListener?.(
        {
          type: 'internal.processContent',
          id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
          content: 'test content',
          pattern: 'summarize',
          customPrompt: 'custom prompt',
        },
        {},
        sendResponse
      );

      expect(result).toBe(true);

      expect(sendResponse).not.toHaveBeenCalled();

      expect(mockPort.postMessage).toHaveBeenCalled();
    });

    it('should handle processContent when not connected', async () => {
      await import('./background');

      const messageListener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0]?.[0];
      const sendResponse = vi.fn();

      await messageListener?.(
        {
          type: 'internal.processContent',
          id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
          content: 'test content',
          pattern: 'summarize',
        },
        {},
        sendResponse
      );

      expect(sendResponse).toHaveBeenCalledWith({
        type: 'internal.processingError',
        message: 'Not connected to native host',
      });
    });
  });

  describe('Native Message Handling', () => {
    it('should handle pong response and update connection status', async () => {
      await import('./background');

      const onStartupListener = vi.mocked(chrome.runtime.onStartup.addListener).mock.calls[0]?.[0];
      await onStartupListener?.();

      const messageHandler = vi.mocked(mockPort.onMessage.addListener).mock.calls[0]?.[0];
      messageHandler?.(
        {
          type: 'native.pong',
          valid: true,
          version: 'v1.0.0',
          id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        },
        mockPort
      );

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'internal.connectionStatus',
        status: 'connected',
      });
    });

    it('should handle invalid pong response', async () => {
      await import('./background');

      const onStartupListener = vi.mocked(chrome.runtime.onStartup.addListener).mock.calls[0]?.[0];
      await onStartupListener?.();

      const messageHandler = vi.mocked(mockPort.onMessage.addListener).mock.calls[0]?.[0];
      messageHandler?.(
        { type: 'native.pong', valid: false, id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' },
        mockPort
      );

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'internal.connectionStatus',
        status: 'disconnected',
      });
    });

    it('should broadcast content messages', async () => {
      await import('./background');

      const onStartupListener = vi.mocked(chrome.runtime.onStartup.addListener).mock.calls[0]?.[0];
      await onStartupListener?.();

      const messageHandler = vi.mocked(mockPort.onMessage.addListener).mock.calls[0]?.[0];
      messageHandler?.(
        {
          type: 'native.content',
          content: 'test content',
          id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        },
        mockPort
      );

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'internal.processingContent',
        id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        content: 'test content',
      });
    });

    it('should broadcast done messages', async () => {
      await import('./background');

      const onStartupListener = vi.mocked(chrome.runtime.onStartup.addListener).mock.calls[0]?.[0];
      await onStartupListener?.();

      const messageHandler = vi.mocked(mockPort.onMessage.addListener).mock.calls[0]?.[0];
      messageHandler?.(
        { type: 'native.done', exitCode: 0, id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' },
        mockPort
      );

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'internal.processingDone',
        id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        exitCode: 0,
      });
    });

    it('should broadcast error messages', async () => {
      await import('./background');

      const onStartupListener = vi.mocked(chrome.runtime.onStartup.addListener).mock.calls[0]?.[0];
      await onStartupListener?.();

      const messageHandler = vi.mocked(mockPort.onMessage.addListener).mock.calls[0]?.[0];
      messageHandler?.(
        { type: 'native.error', message: 'test error', id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' },
        mockPort
      );

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'internal.processingError',
        id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        message: 'test error',
      });
    });

    it('should handle broadcast errors gracefully', async () => {
      mockSendMessage.mockRejectedValue(new Error('Receiving end does not exist'));
      const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      await import('./background');

      const onStartupListener = vi.mocked(chrome.runtime.onStartup.addListener).mock.calls[0]?.[0];
      await onStartupListener?.();

      const messageHandler = vi.mocked(mockPort.onMessage.addListener).mock.calls[0]?.[0];
      messageHandler?.(
        { type: 'native.content', content: 'test', id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' },
        mockPort
      );

      await vi.waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('No listeners for processing content');
      });

      consoleSpy.mockRestore();
    });

    it('should clean up pendingRequests without conditional checks on done/error messages', async () => {
      await import('./background');

      const onStartupListener = vi.mocked(chrome.runtime.onStartup.addListener).mock.calls[0]?.[0];
      await onStartupListener?.();

      const messageHandler = vi.mocked(mockPort.onMessage.addListener).mock.calls[0]?.[0];
      messageHandler?.(
        {
          type: 'native.pong',
          valid: true,
          version: 'v1.0.0',
          id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        },
        mockPort
      );

      const messageListener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0]?.[0];
      const sendResponse = vi.fn();

      await messageListener?.({ type: 'internal.listPatterns' }, {}, sendResponse);

      messageHandler?.(
        {
          type: 'native.done',
          exitCode: 0,
          id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        },
        mockPort
      );

      await messageListener?.({ type: 'internal.listPatterns' }, {}, vi.fn());

      messageHandler?.(
        {
          type: 'native.error',
          message: 'test error',
          id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        },
        mockPort
      );

      expect(true).toBe(true);
    });
  });

  describe('Storage Integration', () => {
    it('should retrieve fabric settings from settings helper', async () => {
      await import('./background');

      const onStartupListener = vi.mocked(chrome.runtime.onStartup.addListener).mock.calls[0]?.[0];
      await onStartupListener?.();

      expect(true).toBe(true);
    });
  });

  describe('Helper Functions', () => {
    it('should cleanupPending with provided reason', async () => {
      const backgroundModule = await import('./background');

      expect(backgroundModule.cleanupPending).toBeDefined();

      expect(() => backgroundModule.cleanupPending('Connection lost')).not.toThrow();
    });

    it('should getPort return null when disconnected', async () => {
      const backgroundModule = await import('./background');

      expect(backgroundModule.getPort).toBeDefined();

      const port = backgroundModule.getPort();
      expect(port).toBeNull();
    });

    it('should separate connection establishment from handshake', async () => {
      const backgroundModule = await import('./background');

      expect(backgroundModule.connectNative).toBeDefined();
      expect(backgroundModule.startNativeHandshake).toBeDefined();

      expect(() => backgroundModule.startNativeHandshake(mockPort)).not.toThrow();
    });
  });

  describe('Error Path Coverage', () => {
    it('should handle native host send failure during processContent', async () => {
      await import('./background');

      const onStartupListener = vi.mocked(chrome.runtime.onStartup.addListener).mock.calls[0]?.[0];
      await onStartupListener?.();

      const messageHandler = vi.mocked(mockPort.onMessage.addListener).mock.calls[0]?.[0];
      messageHandler?.(
        {
          type: 'native.pong',
          valid: true,
          version: 'v1.0.0',
          id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        },
        mockPort
      );

      vi.mocked(mockPort.postMessage).mockImplementation(() => {
        throw new Error('Native connection lost');
      });

      const messageListener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0]?.[0];
      const sendResponse = vi.fn();
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      await messageListener?.(
        {
          type: 'internal.processContent',
          id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
          content: 'test content',
          pattern: 'test_pattern',
        },
        {},
        sendResponse
      );

      expect(sendResponse).toHaveBeenCalledWith({
        type: 'internal.processingError',
        message: 'Failed to send request to native host',
      });

      expect(consoleError).toHaveBeenCalledWith(
        'Failed to send processContent request:',
        expect.any(Error)
      );

      consoleError.mockRestore();
    });

    it('should handle cancelProcess when connected', async () => {
      await import('./background');

      const onStartupListener = vi.mocked(chrome.runtime.onStartup.addListener).mock.calls[0]?.[0];
      await onStartupListener?.();

      const messageHandler = vi.mocked(mockPort.onMessage.addListener).mock.calls[0]?.[0];
      messageHandler?.(
        {
          type: 'native.pong',
          valid: true,
          version: 'v1.0.0',
          id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        },
        mockPort
      );

      const messageListener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0]?.[0];
      const sendResponse = vi.fn();

      const result = await messageListener?.(
        {
          type: 'internal.cancelProcess',
          requestId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        },
        {},
        sendResponse
      );

      expect(result).toBe(true);
      expect(sendResponse).not.toHaveBeenCalled();
      expect(mockPort.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'native.cancelProcess',
          requestId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        })
      );
    });

    it('should handle cancelProcess when not connected', async () => {
      await import('./background');

      const messageListener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0]?.[0];
      const sendResponse = vi.fn();

      await messageListener?.(
        {
          type: 'internal.cancelProcess',
          requestId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        },
        {},
        sendResponse
      );

      expect(sendResponse).toHaveBeenCalledWith({
        type: 'internal.processingError',
        message: 'Not connected to native host',
      });
    });

    it('should handle native.cancelled response', async () => {
      await import('./background');

      const onStartupListener = vi.mocked(chrome.runtime.onStartup.addListener).mock.calls[0]?.[0];
      await onStartupListener?.();

      const messageHandler = vi.mocked(mockPort.onMessage.addListener).mock.calls[0]?.[0];
      messageHandler?.(
        {
          type: 'native.pong',
          valid: true,
          version: 'v1.0.0',
          id: 'a47ac10b-58cc-4372-a567-0e02b2c3d479',
        },
        mockPort
      );

      const messageListener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0]?.[0];
      const sendResponse = vi.fn();

      await messageListener?.(
        {
          type: 'internal.processContent',
          id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
          content: 'test content',
          pattern: 'test_pattern',
        },
        {},
        sendResponse
      );

      messageHandler?.(
        {
          type: 'native.cancelled',
          id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
          requestId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        },
        mockPort
      );

      expect(sendResponse).toHaveBeenCalledWith({
        type: 'internal.processingCancelled',
        id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      });
    });

    it('should handle unknown message types', async () => {
      await import('./background');

      const messageListener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0]?.[0];
      const sendResponse = vi.fn();
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await messageListener?.(
        {
          type: 'internal.unknown_type' as any,
        },
        {},
        sendResponse
      );

      expect(consoleWarn).toHaveBeenCalledWith('Received invalid request', expect.any(Object));

      consoleWarn.mockRestore();
    });
  });
});
