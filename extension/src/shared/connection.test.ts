import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  sendSafely,
  getConnectionStatus,
  addConnectionListener,
  removeConnectionListener,
  _resetConnectionState,
} from './connection';
import type { InternalRequest, InternalResponse } from './messages';

describe('connection helpers', () => {
  beforeEach(() => {
    global.chrome = {
      runtime: {
        sendMessage: vi.fn(),
        onMessage: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
    } as any;
  });

  afterEach(() => {
    vi.resetAllMocks();
    _resetConnectionState();
  });

  describe('sendSafely', () => {
    it('should send message and return response on success', async () => {
      const request: InternalRequest = { type: 'internal.connection_status' };
      const expectedResponse: InternalResponse = {
        type: 'internal.connection_status',
        status: 'connected',
      };

      const mockSendMessage = vi.mocked(chrome.runtime.sendMessage) as any;
      mockSendMessage.mockResolvedValue(expectedResponse);

      const result = await sendSafely(request);

      expect(mockSendMessage).toHaveBeenCalledWith(request);
      expect(result).toEqual(expectedResponse);
    });

    it('should return undefined and log debug when "Receiving end does not exist" error occurs', async () => {
      const request: InternalRequest = { type: 'internal.connection_status' };
      const error = new Error('Could not establish connection. Receiving end does not exist.');

      const mockSendMessage = vi.mocked(chrome.runtime.sendMessage) as any;
      mockSendMessage.mockRejectedValue(error);

      const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      const result = await sendSafely(request);

      expect(mockSendMessage).toHaveBeenCalledWith(request);
      expect(result).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith('No listeners for extension message:', request.type);

      consoleSpy.mockRestore();
    });

    it('should return undefined and log error for other types of errors', async () => {
      const request: InternalRequest = { type: 'internal.connection_status' };
      const error = new Error('Some other error');

      const mockSendMessage = vi.mocked(chrome.runtime.sendMessage) as any;
      mockSendMessage.mockRejectedValue(error);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await sendSafely(request);

      expect(mockSendMessage).toHaveBeenCalledWith(request);
      expect(result).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith('Extension message failed:', error);

      consoleSpy.mockRestore();
    });

    it('should handle non-Error objects as errors', async () => {
      const request: InternalRequest = { type: 'internal.connection_status' };
      const error = 'string error';

      const mockSendMessage = vi.mocked(chrome.runtime.sendMessage) as any;
      mockSendMessage.mockRejectedValue(error);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await sendSafely(request);

      expect(mockSendMessage).toHaveBeenCalledWith(request);
      expect(result).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith('Extension message failed:', error);

      consoleSpy.mockRestore();
    });
  });

  describe('getConnectionStatus', () => {
    it('should return connection status from response', async () => {
      const expectedResponse: InternalResponse = {
        type: 'internal.connection_status',
        status: 'connected',
      };

      const mockSendMessage = vi.mocked(chrome.runtime.sendMessage) as any;
      mockSendMessage.mockResolvedValue(expectedResponse);

      const result = await getConnectionStatus();

      expect(mockSendMessage).toHaveBeenCalledWith({ type: 'internal.connection_status' });
      expect(result).toBe('connected');
    });

    it('should return "disconnected" when sendSafely returns undefined', async () => {
      const mockSendMessage = vi.mocked(chrome.runtime.sendMessage) as any;
      mockSendMessage.mockRejectedValue(
        new Error('Could not establish connection. Receiving end does not exist.')
      );

      vi.spyOn(console, 'debug').mockImplementation(() => {});

      const result = await getConnectionStatus();

      expect(result).toBe('disconnected');
    });

    it('should return "disconnected" for wrong response type', async () => {
      const wrongResponse: InternalResponse = {
        type: 'internal.patterns_list',
        patterns: [],
      };

      const mockSendMessage = vi.mocked(chrome.runtime.sendMessage) as any;
      mockSendMessage.mockResolvedValue(wrongResponse);

      const result = await getConnectionStatus();

      expect(result).toBe('disconnected');
    });
  });

  describe('connection listeners', () => {
    it('should add listener for connection status messages', () => {
      const listener = vi.fn();
      const mockAddListener = vi.mocked(chrome.runtime.onMessage.addListener);

      addConnectionListener(listener);

      expect(mockAddListener).toHaveBeenCalledWith(expect.any(Function));

      const internalListener = mockAddListener.mock.calls[0]?.[0];
      expect(internalListener).toBeDefined();
      const message = { type: 'internal.connection_status', status: 'connected' };

      internalListener!(message, {}, () => {});

      expect(listener).toHaveBeenCalledWith('connected');
    });

    it('should not call listener for non-connection status messages', () => {
      const listener = vi.fn();
      const mockAddListener = vi.mocked(chrome.runtime.onMessage.addListener);

      addConnectionListener(listener);

      const calls = mockAddListener.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const internalListener = calls[calls.length - 1]?.[0];
      expect(internalListener).toBeDefined();

      const message = { type: 'internal.patterns_list', patterns: [] };

      internalListener!(message, {}, () => {});

      expect(listener).not.toHaveBeenCalled();
    });

    it('should remove connection listener and clean up chrome listener when no more listeners', () => {
      const listener = vi.fn();
      const mockRemoveListener = vi.mocked(chrome.runtime.onMessage.removeListener);

      addConnectionListener(listener);

      removeConnectionListener(listener);

      expect(mockRemoveListener).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should not remove chrome listener when other listeners remain', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const mockRemoveListener = vi.mocked(chrome.runtime.onMessage.removeListener);

      addConnectionListener(listener1);
      addConnectionListener(listener2);

      removeConnectionListener(listener1);

      expect(mockRemoveListener).not.toHaveBeenCalled();

      removeConnectionListener(listener2);

      expect(mockRemoveListener).toHaveBeenCalledWith(expect.any(Function));
    });
  });
});
