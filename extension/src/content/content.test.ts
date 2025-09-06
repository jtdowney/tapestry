import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@mozilla/readability');
vi.mock('turndown');

describe('content script', () => {
  let mockSendResponse: ReturnType<typeof vi.fn>;
  let mockReadability: { parse: ReturnType<typeof vi.fn> };
  let mockTurndown: { turndown: ReturnType<typeof vi.fn> };
  let messageListener: any;
  let originalDocument: any;

  beforeEach(async () => {
    vi.resetModules();

    originalDocument = globalThis.document;

    mockSendResponse = vi.fn();

    mockReadability = {
      parse: vi.fn(),
    };
    vi.mocked(Readability).mockImplementation(() => mockReadability as any);

    mockTurndown = {
      turndown: vi.fn(),
    };
    vi.mocked(TurndownService).mockImplementation(() => mockTurndown as any);

    globalThis.document = {
      cloneNode: vi.fn().mockReturnValue({}),
    } as any;

    const mockAddListener = vi.fn();
    chrome.runtime.onMessage.addListener = mockAddListener;

    await import('./content');

    messageListener = mockAddListener.mock.calls[0]?.[0];
  });

  afterEach(() => {
    globalThis.document = originalDocument;
  });

  it('should handle capture_page request successfully', async () => {
    const mockArticle = {
      title: 'Test Article',
      content: '<h1>Test Content</h1>',
    };
    mockReadability.parse.mockReturnValue(mockArticle);
    mockTurndown.turndown.mockReturnValue('# Test Content');

    const message = { type: 'internal.capturePage' };

    const result = messageListener(message, null, mockSendResponse);

    expect(result).toBe(true);

    await vi.waitFor(() => {
      expect(mockSendResponse).toHaveBeenCalledWith({
        type: 'internal.pageContent',
        content: '# Test Article\n\n# Test Content',
      });
    });
  });

  it('should handle article extraction failure', async () => {
    mockReadability.parse.mockReturnValue(null);

    const message = { type: 'internal.capturePage' };

    const result = messageListener(message, null, mockSendResponse);

    expect(result).toBe(true);

    await vi.waitFor(() => {
      expect(mockSendResponse).toHaveBeenCalledWith({
        type: 'internal.processingError',
        message: 'Failed to extract readable content from page',
      });
    });
  });

  it('should handle untitled articles', async () => {
    const mockArticle = {
      title: null,
      content: '<p>Test content</p>',
    };
    mockReadability.parse.mockReturnValue(mockArticle);
    mockTurndown.turndown.mockReturnValue('Test content');

    const message = { type: 'internal.capturePage' };

    messageListener(message, null, mockSendResponse);

    await vi.waitFor(() => {
      expect(mockSendResponse).toHaveBeenCalledWith({
        type: 'internal.pageContent',
        content: '# Untitled\n\nTest content',
      });
    });
  });

  it('should handle exceptions during content processing', async () => {
    mockReadability.parse.mockImplementation(() => {
      throw new Error('Processing failed');
    });

    const message = { type: 'internal.capturePage' };

    messageListener(message, null, mockSendResponse);

    await vi.waitFor(() => {
      expect(mockSendResponse).toHaveBeenCalledWith({
        type: 'internal.processingError',
        message: 'Content extraction failed: Error: Processing failed',
      });
    });
  });

  it('should return false for non-internal.capturePage messages', () => {
    const message = { type: 'other_message' };

    const result = messageListener(message, null, mockSendResponse);

    expect(result).toBe(false);
    expect(mockSendResponse).not.toHaveBeenCalled();
  });

  it('should return false for invalid message format', () => {
    const message = { invalid: 'message' };

    const result = messageListener(message, null, mockSendResponse);

    expect(result).toBe(false);
    expect(mockSendResponse).not.toHaveBeenCalled();
  });
});
