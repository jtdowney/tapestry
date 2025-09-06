import { render, waitFor } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import ConnectionStatus from './ConnectionStatus.svelte';

describe('ConnectionStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle status transitions correctly', async () => {
    const messageListeners: any[] = [];
    chrome.runtime.onMessage.addListener = vi.fn((listener) => {
      messageListeners.push(listener);
    });
    chrome.runtime.sendMessage = vi.fn().mockResolvedValue({
      type: 'internal.connectionStatus',
      status: 'connected',
    });

    const { container } = render(ConnectionStatus);

    let connectedMessage = { type: 'internal.connectionStatus', status: 'connected' };
    messageListeners.forEach((listener) => listener(connectedMessage));

    await waitFor(() => {
      const successIcon = container.querySelector('.fill-success');
      expect(successIcon).toBeInTheDocument();
    });

    let disconnectedMessage = { type: 'internal.connectionStatus', status: 'disconnected' };
    messageListeners.forEach((listener) => listener(disconnectedMessage));

    await waitFor(() => {
      const errorIcon = container.querySelector('.fill-error');
      expect(errorIcon).toBeInTheDocument();
      const retryButton = container.querySelector(
        '.tooltip[data-tip="Reconnect to native host"] button'
      );
      expect(retryButton).toBeInTheDocument();
    });

    connectedMessage = { type: 'internal.connectionStatus', status: 'connected' };
    messageListeners.forEach((listener) => listener(connectedMessage));

    await waitFor(() => {
      const successIcon = container.querySelector('.fill-success');
      expect(successIcon).toBeInTheDocument();
      const retryButton = container.querySelector(
        '.tooltip[data-tip="Reconnect to native host"] button'
      );
      expect(retryButton).not.toBeInTheDocument();
    });
  });
});
