import { NativeRequestSchema, NativeResponseSchema, type NativeResponse } from './messages';

import {
  InternalRequestSchema,
  type InternalRequest,
  type InternalResponse,
} from '$shared/messages';
import { generateRequestId } from '$shared/requestId';
import { loadFabricSettings } from '$shared/settings';

type Connection =
  | { status: 'disconnected' }
  | { status: 'connecting'; port: chrome.runtime.Port }
  | { status: 'connected'; port: chrome.runtime.Port };

let nativeConnection: Connection = { status: 'disconnected' };
const pendingRequests = new Map<string, (response: InternalResponse) => void>();

export function cleanupPending(reason: string): void {
  for (const [, callback] of pendingRequests.entries()) {
    callback({ type: 'internal.processing_error', message: reason });
  }
  pendingRequests.clear();
}

export function getPort(): chrome.runtime.Port | null {
  switch (nativeConnection.status) {
    case 'connecting':
    case 'connected':
      return nativeConnection.port;
    case 'disconnected':
      return null;
  }
}

async function setupSidebar(): Promise<void> {
  if (typeof chrome.sidePanel !== 'undefined') {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } else if (typeof (chrome as any).sidebarAction !== 'undefined') {
    chrome.action.onClicked.addListener(() => {
      (chrome as any).sidebarAction.open();
    });
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    console.log('Tapestry installed');
  }

  await setupSidebar();
  await connectNative();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('Tapestry started');
  await setupSidebar();
  await connectNative();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const parsed = InternalRequestSchema.safeParse(message);
  if (parsed.success) {
    console.debug(`[onMessage] Handling ${parsed.data.type} message`);
    handleMessage(parsed.data, sender, sendResponse);
    return true;
  } else {
    console.warn('Received invalid request', parsed.error);
    sendResponse({ type: 'internal.processing_error', message: 'Invalid request format' });
    return false;
  }
});

export async function connectNative(): Promise<chrome.runtime.Port> {
  switch (nativeConnection.status) {
    case 'disconnected': {
      console.debug('Attempting connection...');
      const port = chrome.runtime.connectNative('com.jtdowney.tapestry');
      nativeConnection = { status: 'connecting', port };

      port.onDisconnect.addListener(() => {
        console.log('Native connection disconnected');
        cleanupPending('Connection disconnected');
        nativeConnection = { status: 'disconnected' };
        broadcastConnectionStatus();
      });

      port.onMessage.addListener((message) => {
        const parsed = NativeResponseSchema.safeParse(message);
        if (parsed.success) {
          handleNativeMessage(parsed.data, port);
        } else {
          console.warn('Received invalid native message', parsed.error);
        }
      });

      await startNativeHandshake(port);
      return port;
    }
    case 'connecting':
      console.debug('Already connecting...');
      return nativeConnection.port;
    case 'connected':
      console.debug('Already connected...');
      return nativeConnection.port;
  }
}

export async function startNativeHandshake(port: chrome.runtime.Port): Promise<void> {
  const { path: fabricPath } = await loadFabricSettings();

  const result = NativeRequestSchema.safeParse({
    type: 'native.ping',
    id: generateRequestId(),
    path: fabricPath,
  });

  if (!result.success) {
    console.warn('Failed to create ping request:', result.error);
    return;
  }

  port.postMessage(result.data);
}

function broadcastConnectionStatus(): void {
  const status = nativeConnection.status === 'connected' ? 'connected' : 'disconnected';

  chrome.runtime.sendMessage({ type: 'internal.connection_status', status }).catch((error) => {
    if (error?.message?.includes('Receiving end does not exist')) {
      console.debug('No listeners for connection status update');
    } else {
      console.warn('Failed to broadcast connection status:', error);
    }
  });
}

function handleNativeMessage(message: NativeResponse, port: chrome.runtime.Port): void {
  console.debug(`[Native Message] Handling ${message.type} message`);
  switch (message.type) {
    case 'native.pong': {
      if (message.valid) {
        console.log('Received version:', message.version ?? 'unknown');
        nativeConnection = { status: 'connected', port };
      } else {
        console.warn('Native host reported invalid state', {
          resolvedPath: message.resolvedPath,
          version: message.version,
        });

        cleanupPending('Native host reported invalid state');
        nativeConnection = { status: 'disconnected' };
      }

      broadcastConnectionStatus();
      break;
    }
    case 'native.patternsList': {
      console.log('Patterns:', message.patterns);
      const respond = pendingRequests.get(message.id);
      if (respond) {
        respond({ type: 'internal.patterns_list', patterns: message.patterns });
        pendingRequests.delete(message.id);
      }
      break;
    }
    case 'native.content': {
      const truncatedContent =
        message.content.length > 100 ? `${message.content.slice(0, 100)}...` : message.content;
      console.log('Content received:', truncatedContent);
      chrome.runtime
        .sendMessage({ type: 'internal.processing_content', content: message.content })
        .catch((error) => {
          if (error?.message?.includes('Receiving end does not exist')) {
            console.debug('No listeners for processing content');
          } else {
            console.warn('Failed to send processing content:', error);
          }
        });
      break;
    }
    case 'native.done': {
      console.log('Process done. exitCode:', message.exitCode ?? null);
      chrome.runtime
        .sendMessage({ type: 'internal.processing_done', exitCode: message.exitCode ?? null })
        .catch((error) => {
          if (error?.message?.includes('Receiving end does not exist')) {
            console.debug('No listeners for processing done');
          } else {
            console.warn('Failed to send processing done:', error);
          }
        });
      pendingRequests.delete(message.id);
      break;
    }
    case 'native.error': {
      console.error('Native error:', message.message);
      chrome.runtime
        .sendMessage({ type: 'internal.processing_error', message: message.message })
        .catch((error) => {
          if (error?.message?.includes('Receiving end does not exist')) {
            console.debug('No listeners for processing error');
          } else {
            console.warn('Failed to send processing error:', error);
          }
        });
      pendingRequests.delete(message.id);
      break;
    }
  }
}

async function handleMessage(
  data: InternalRequest,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: InternalResponse) => void
): Promise<void> {
  console.debug(`[handleMessage] Received ${data.type} message`);

  switch (data.type) {
    case 'internal.connection_status': {
      const status = nativeConnection.status === 'connected' ? 'connected' : 'disconnected';
      sendResponse({ type: 'internal.connection_status', status });
      break;
    }
    case 'internal.reconnect_native': {
      console.debug('Reconnecting to native host...');

      if (nativeConnection.status === 'connected' || nativeConnection.status === 'connecting') {
        nativeConnection.port.disconnect();
      }

      cleanupPending('Connection reset during reconnection');
      nativeConnection = { status: 'disconnected' };
      broadcastConnectionStatus();

      connectNative().catch((error) => {
        console.error('Failed to start reconnection:', error);
      });

      sendResponse({ type: 'internal.connection_status', status: 'disconnected' });
      break;
    }
    case 'internal.list_patterns': {
      if (nativeConnection.status !== 'connected') {
        console.debug('Not connected to native host');
        sendResponse({
          type: 'internal.processing_error',
          message: 'Not connected to native host',
        });
        return;
      }

      const { path: fabricPath } = await loadFabricSettings();

      const id = generateRequestId();
      const result = NativeRequestSchema.safeParse({
        type: 'native.listPatterns',
        id,
        path: fabricPath,
      });

      if (!result.success) {
        console.warn('Failed to create listPatterns request:', result.error);
        sendResponse({
          type: 'internal.processing_error',
          message: 'Invalid request configuration',
        });
        return;
      }

      try {
        console.debug('Sending listPatterns request to native host: ', result.data);
        nativeConnection.port.postMessage(result.data);
        pendingRequests.set(id, sendResponse);
      } catch (error) {
        console.error('Failed to send listPatterns request:', error);
        sendResponse({
          type: 'internal.processing_error',
          message: 'Failed to send request to native host',
        });
        return;
      }
      break;
    }
    case 'internal.capture_page': {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const activeTab = tabs[0];

        if (!activeTab?.id) {
          sendResponse({ type: 'internal.processing_error', message: 'No active tab' });
          return;
        }

        chrome.tabs.sendMessage(activeTab.id, { type: 'internal.capture_page' }, (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({
              type: 'internal.processing_error',
              message: 'Content script not available. Please refresh the page.',
            });
          } else {
            sendResponse(response);
          }
        });
      } catch (error) {
        sendResponse({
          type: 'internal.processing_error',
          message: `Failed to capture page: ${error}`,
        });
        return;
      }
      break;
    }
    case 'internal.process_content': {
      if (nativeConnection.status !== 'connected') {
        sendResponse({
          type: 'internal.processing_error',
          message: 'Not connected to native host',
        });
        return;
      }

      const { path: fabricPath, model: fabricModel } = await loadFabricSettings();

      const id = generateRequestId();
      const result = NativeRequestSchema.safeParse({
        type: 'native.processContent',
        id,
        content: data.content,
        model: fabricModel,
        pattern: data.pattern,
        path: fabricPath,
        customPrompt: data.customPrompt,
      });

      if (!result.success) {
        console.warn('Failed to create processContent request:', result.error);
        sendResponse({
          type: 'internal.processing_error',
          message: 'Invalid request configuration',
        });
        return;
      }

      try {
        nativeConnection.port.postMessage(result.data);
        pendingRequests.set(id, sendResponse);
      } catch (error) {
        console.error('Failed to send processContent request:', error);
        sendResponse({
          type: 'internal.processing_error',
          message: 'Failed to send request to native host',
        });
        return;
      }
      break;
    }
    default: {
      console.warn(`Unknown message type: ${(data as any).type}`);
      sendResponse({
        type: 'internal.processing_error',
        message: 'Unknown message type',
      });
      break;
    }
  }
}
