import { render } from '@testing-library/svelte';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import MarkdownOutput from './MarkdownOutput.svelte';

vi.mock('marked', () => ({
  marked: vi.fn(),
}));

vi.mock('dompurify', () => ({
  default: {
    sanitize: vi.fn(),
  },
}));

describe('MarkdownOutput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should sanitize potentially dangerous HTML', () => {
    vi.mocked(marked).mockReturnValue('<script>alert("xss")</script><p>Safe content</p>');
    vi.mocked(DOMPurify.sanitize).mockReturnValue('<p>Safe content</p>');

    render(MarkdownOutput, {
      props: { content: '[link](javascript:alert("xss"))' },
    });

    expect(DOMPurify.sanitize).toHaveBeenCalledWith(
      '<script>alert("xss")</script><p>Safe content</p>'
    );
  });
});
