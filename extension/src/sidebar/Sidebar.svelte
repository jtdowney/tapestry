<script lang="ts">
  import { Settings, FileText, Code, Code2 } from '@lucide/svelte';
  import { onMount } from 'svelte';

  import MarkdownOutput from './components/MarkdownOutput.svelte';
  import PatternSelector from './components/PatternSelector.svelte';

  import ConnectionStatus from '$shared/components/ConnectionStatus.svelte';
  import { sendSafely } from '$shared/connection';
  import { RECOMMENDED_PATTERNS } from '$shared/constants';
  import { InternalRequestSchema } from '$shared/messages';
  import { loadSettings, saveSettings, watchSettings } from '$shared/settings';

  let selectedPattern = $state<string>('Custom');
  let customPrompt = $state<string>('');
  let output = $state<string>('');
  let outputError = $state<string>('');
  let processing = $state<boolean>(false);
  let patterns = $state<string[]>(['Custom']);
  let loadingPatterns = $state<boolean>(false);
  let showCustomPrompt = $state<boolean>(true);
  let renderAsMarkdown = $state<boolean>(true);
  let localRenderAsMarkdown = $state<boolean>(true);
  let sendRawContent = $state<boolean>(false);

  const isCustomPattern = $derived(selectedPattern === 'Custom');

  onMount(() => {
    (async () => {
      const settings = await loadSettings();
      showCustomPrompt = settings.showCustomPrompt;
      renderAsMarkdown = settings.renderAsMarkdown;
      localRenderAsMarkdown = settings.renderAsMarkdown;
      sendRawContent = settings.sendRawContent;

      try {
        loadingPatterns = true;
        const response = await sendSafely({ type: 'internal.list_patterns' });
        if (!response) {
          console.warn('Unable to load patterns: extension communication failed');
          return;
        }

        if (response.type === 'internal.patterns_list') {
          const allPatterns = response.patterns;
          const visiblePatterns = settings.visiblePatterns;

          const filteredPatterns = allPatterns.filter((pattern) =>
            visiblePatterns.includes(pattern)
          );
          patterns = showCustomPrompt ? ['Custom', ...filteredPatterns] : filteredPatterns;

          if (settings.defaultPattern && filteredPatterns.includes(settings.defaultPattern)) {
            selectedPattern = settings.defaultPattern;
          } else if (!showCustomPrompt && selectedPattern === 'Custom') {
            selectedPattern = filteredPatterns.length > 0 ? filteredPatterns[0]! : '';
          } else if (!settings.defaultPattern) {
            const firstRecommended = RECOMMENDED_PATTERNS.find((pattern) =>
              filteredPatterns.includes(pattern)
            );
            if (firstRecommended) {
              selectedPattern = firstRecommended;
            }
          }
        }
      } catch (error) {
        console.error('Failed to load patterns:', error);
      } finally {
        loadingPatterns = false;
      }
    })();

    const handleMessage = (message: any) => {
      if (message.type === 'internal.processing_content') {
        output += message.content;
      } else if (message.type === 'internal.processing_done') {
        processing = false;
      } else if (message.type === 'internal.processing_error') {
        outputError = message.message;
        processing = false;
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    const handleStorageChanged = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string
    ) => {
      if (area === 'local') {
        if (changes.showCustomPrompt && changes.showCustomPrompt.newValue !== undefined) {
          showCustomPrompt = changes.showCustomPrompt.newValue;

          if (showCustomPrompt && !patterns.includes('Custom')) {
            patterns = ['Custom', ...patterns.filter((p) => p !== 'Custom')];
          } else if (!showCustomPrompt && patterns.includes('Custom')) {
            patterns = patterns.filter((p) => p !== 'Custom');

            if (selectedPattern === 'Custom') {
              selectedPattern = patterns.length > 0 ? patterns[0]! : '';
            }
          }
        }

        if (changes.renderAsMarkdown && changes.renderAsMarkdown.newValue !== undefined) {
          renderAsMarkdown = changes.renderAsMarkdown.newValue;
          localRenderAsMarkdown = changes.renderAsMarkdown.newValue;
        }

        if (changes.sendRawContent && changes.sendRawContent.newValue !== undefined) {
          sendRawContent = changes.sendRawContent.newValue;
        }

        if (changes.visiblePatterns && changes.visiblePatterns.newValue !== undefined) {
          const visiblePatterns = changes.visiblePatterns.newValue;

          const basePatterns = showCustomPrompt ? ['Custom'] : [];
          patterns = [...basePatterns, ...visiblePatterns];

          if (selectedPattern && !patterns.includes(selectedPattern)) {
            const firstRecommended = RECOMMENDED_PATTERNS.find((pattern) =>
              visiblePatterns.includes(pattern)
            );
            selectedPattern = firstRecommended || (patterns.length > 0 ? patterns[0]! : '');
          }
        }

        if (changes.defaultPattern && changes.defaultPattern.newValue !== undefined) {
          const defaultPattern = changes.defaultPattern.newValue;
          if (defaultPattern && patterns.includes(defaultPattern)) {
            selectedPattern = defaultPattern;
          }
        }
      }
    };

    const cleanupStorage = watchSettings(handleStorageChanged);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
      cleanupStorage();
    };
  });

  function handleSettings(): void {
    chrome.runtime.openOptionsPage();
  }

  async function handleRawContentToggle(checked: boolean): Promise<void> {
    try {
      sendRawContent = checked;
      await saveSettings({ sendRawContent: checked });
    } catch (error) {
      console.error('Failed to save raw content setting:', error);

      sendRawContent = !checked;
    }
  }

  async function handleGo(): Promise<void> {
    if (processing || (isCustomPattern && !customPrompt.trim())) return;

    try {
      processing = true;
      output = '';
      outputError = '';
      localRenderAsMarkdown = renderAsMarkdown;

      const pageResponse = await sendSafely({
        type: 'internal.capture_page',
        rawContent: sendRawContent,
      });
      if (!pageResponse) {
        outputError = 'Unable to communicate with extension background';
        processing = false;
        return;
      }

      if (pageResponse.type === 'internal.processing_error') {
        outputError = pageResponse.message;
        processing = false;
        return;
      }

      if (pageResponse.type === 'internal.page_content') {
        const processRequest = InternalRequestSchema.parse({
          type: 'internal.process_content',
          content: pageResponse.content,
          pattern: isCustomPattern ? undefined : selectedPattern,
          customPrompt: isCustomPattern ? customPrompt : undefined,
        });

        sendSafely(processRequest);
      }
    } catch (error) {
      outputError = error instanceof Error ? error.message : 'Failed to process content';
      processing = false;
    }
  }
</script>

<div class="flex flex-col h-screen bg-base-100">
  <div class="flex-none border-b border-base-300 py-2 px-3">
    <div class="flex items-center justify-between">
      <h1 class="text-base font-semibold text-base-content">Tapestry</h1>
      <div class="flex items-center gap-2">
        {#if output}
          <div
            class="tooltip tooltip-bottom"
            data-tip={localRenderAsMarkdown ? 'Show raw text' : 'Show as markdown'}
          >
            <button
              onclick={() => (localRenderAsMarkdown = !localRenderAsMarkdown)}
              class="btn btn-ghost btn-xs p-1 min-h-0 h-auto"
            >
              {#if localRenderAsMarkdown}
                <Code size={14} />
              {:else}
                <FileText size={14} />
              {/if}
            </button>
          </div>
        {/if}
        <div class="tooltip tooltip-left" data-tip="Open Settings">
          <button onclick={handleSettings} class="btn btn-ghost btn-xs p-1 min-h-0 h-auto">
            <Settings size={14} />
          </button>
        </div>
        <ConnectionStatus />
      </div>
    </div>
  </div>

  <div class="flex-none p-2 border-b border-base-200">
    <div class="flex gap-2 items-center">
      <PatternSelector
        bind:value={selectedPattern}
        {patterns}
        loading={loadingPatterns}
        class="flex-1 text-sm"
      />

      <div class="tooltip tooltip-bottom" data-tip="Send page as raw HTML instead of markdown">
        <label class="label cursor-pointer gap-2 py-1 px-2 rounded hover:bg-base-200">
          <span class="label-text text-xs flex items-center gap-1">
            {#if sendRawContent}
              <Code2 size={12} />
            {:else}
              <FileText size={12} />
            {/if}
            Raw
          </span>
          <input
            type="checkbox"
            class="toggle toggle-xs toggle-primary"
            checked={sendRawContent}
            onchange={(e) => handleRawContentToggle(e.currentTarget.checked)}
          />
        </label>
      </div>

      <button
        onclick={handleGo}
        disabled={processing || (isCustomPattern && !customPrompt.trim())}
        class="btn btn-primary text-sm"
      >
        {processing ? 'Processing...' : 'Go'}
      </button>
    </div>

    {#if isCustomPattern && showCustomPrompt}
      <div class="mt-2">
        <input
          type="text"
          bind:value={customPrompt}
          placeholder="Enter your custom prompt..."
          class="input input-bordered w-full text-sm"
        />
      </div>
    {/if}
  </div>

  <div class="flex-1 flex flex-col min-h-0">
    <div class="flex-1 p-2 bg-base-200">
      <div class="bg-base-300 rounded-lg h-full p-2 overflow-y-auto">
        {#if outputError}
          <div class="text-sm text-error">{outputError}</div>
        {:else if output}
          {#if localRenderAsMarkdown}
            <MarkdownOutput content={output} />
          {:else}
            <pre
              class="text-sm text-base-content whitespace-pre-wrap font-mono overflow-y-auto max-w-none">{output}</pre>
          {/if}
        {:else if processing}
          <div class="flex items-center gap-2 text-sm text-base-content/60">
            <span class="loading loading-spinner loading-md text-primary"></span>
            <span class="italic">Processing current page...</span>
          </div>
        {:else}
          <div class="text-sm text-base-content/60 italic">
            Click "Go" to process the current page with Fabric
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
