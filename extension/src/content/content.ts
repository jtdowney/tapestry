import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';

import { InternalRequestSchema, type InternalResponse } from '$shared/messages';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const parsed = InternalRequestSchema.safeParse(message);
  if (parsed.success && parsed.data.type === 'internal.capturePage') {
    handleCapturePage(parsed.data.rawContent || false)
      .then(sendResponse)
      .catch((error) => {
        sendResponse({
          type: 'internal.processingError',
          message: `Content extraction failed: ${error}`,
        });
      });
    return true;
  }
  return false;
});

async function handleCapturePage(rawContent: boolean): Promise<InternalResponse> {
  try {
    const documentClone = document.cloneNode(true) as Document;
    const reader = new Readability(documentClone);
    const article = reader.parse();

    if (!article) {
      return {
        type: 'internal.processingError',
        message: 'Failed to extract readable content from page',
      };
    }

    let content: string;
    if (rawContent) {
      content = `# ${article.title || 'Untitled'}\n\n${article.content || ''}`;
    } else {
      const markdown = turndown.turndown(article.content || '');
      content = `# ${article.title || 'Untitled'}\n\n${markdown}`;
    }

    return {
      type: 'internal.pageContent',
      content,
    };
  } catch (error) {
    return {
      type: 'internal.processingError',
      message: `Content extraction failed: ${error}`,
    };
  }
}
