<script lang="ts">
  import DOMPurify from 'dompurify';
  import { marked } from 'marked';

  interface Props {
    content?: string;
  }

  let { content = '' }: Props = $props();

  const processedHtml = $derived.by(() => {
    if (!content) return '';
    try {
      const html = marked(content) as string;
      return DOMPurify.sanitize(html);
    } catch {
      return content;
    }
  });
</script>

<div class="prose prose-sm prose-slate dark:prose-invert max-w-none overflow-y-auto">
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html processedHtml}
</div>
