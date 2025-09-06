import type { InternalRequest, InternalResponse } from './messages';

const connectionListeners = new Set<(status: 'connected' | 'disconnected') => void>();
let messageListenerRegistered = false;

let chromeMessageListener: ((message: any) => void) | null = null;

export async function sendSafely(request: InternalRequest): Promise<InternalResponse | undefined> {
  try {
    const response = await chrome.runtime.sendMessage(request);
    return response;
  } catch (error) {
    if (error && typeof error === 'object' && 'message' in error) {
      const errorMessage = (error as Error).message;
      if (errorMessage.includes('Receiving end does not exist')) {
        console.debug('No listeners for extension message:', request.type);
        return undefined;
      }
    }

    console.error('Extension message failed:', error);
    return undefined;
  }
}

export async function getConnectionStatus(): Promise<'connected' | 'disconnected'> {
  const response = await sendSafely({ type: 'internal.connectionStatus' });

  if (response && response.type === 'internal.connectionStatus') {
    return response.status;
  }

  return 'disconnected';
}

export function addConnectionListener(
  listener: (status: 'connected' | 'disconnected') => void
): void {
  connectionListeners.add(listener);

  if (!messageListenerRegistered) {
    chromeMessageListener = handleInternalMessage;
    chrome.runtime.onMessage.addListener(chromeMessageListener);
    messageListenerRegistered = true;
  }
}

export function removeConnectionListener(
  listener: (status: 'connected' | 'disconnected') => void
): void {
  connectionListeners.delete(listener);

  if (connectionListeners.size === 0 && messageListenerRegistered && chromeMessageListener) {
    chrome.runtime.onMessage.removeListener(chromeMessageListener);
    messageListenerRegistered = false;
    chromeMessageListener = null;
  }
}

function handleInternalMessage(message: any): void {
  if (message && message.type === 'internal.connectionStatus' && message.status) {
    connectionListeners.forEach((listener) => {
      listener(message.status);
    });
  }
}

export function _resetConnectionState(): void {
  connectionListeners.clear();
  messageListenerRegistered = false;
  chromeMessageListener = null;
}
