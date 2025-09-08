<script lang="ts">
  import { Settings, FileText, Code, Code2, X } from '@lucide/svelte';
  import { onMount } from 'svelte';

  import MarkdownOutput from './components/MarkdownOutput.svelte';
  import PatternSelector from './components/PatternSelector.svelte';
  import type { ProcessingState, PatternsState, UISettings } from './types';
  import { isProcessing, hasOutput, getOutput, getRequestId } from './types';

  import ConnectionStatus from '$shared/components/ConnectionStatus.svelte';
  import { sendSafely } from '$shared/connection';
  import { RECOMMENDED_PATTERNS } from '$shared/constants';
  import { InternalRequestSchema } from '$shared/messages';
  import { generateRequestId } from '$shared/requestId';
  import { loadSettings, saveSettings, watchSettings } from '$shared/settings';

  let processingState = $state<ProcessingState>({ type: 'idle' });
  let patternsState = $state<PatternsState>({ type: 'loading' });
  let uiSettings = $state<UISettings>({
    selectedPattern: 'Custom',
    customPrompt: '',
    showCustomPrompt: true,
    renderAsMarkdown: true,
    localRenderAsMarkdown: true,
    sendRawContent: false,
  });

  const isCustomPattern = $derived(uiSettings.selectedPattern === 'Custom');
  const availablePatterns = $derived(
    patternsState.type === 'loaded' ? patternsState.patterns : ['Custom']
  );
  const currentOutput = $derived(getOutput(processingState));
  const isCurrentlyProcessing = $derived(isProcessing(processingState));

  onMount(() => {
    (async () => {
      const settings = await loadSettings();
      uiSettings = {
        ...uiSettings,
        showCustomPrompt: settings.showCustomPrompt,
        renderAsMarkdown: settings.renderAsMarkdown,
        localRenderAsMarkdown: settings.renderAsMarkdown,
        sendRawContent: settings.sendRawContent,
      };

      try {
        patternsState = { type: 'loading' };
        const response = await sendSafely({ type: 'internal.listPatterns' });
        if (!response) {
          patternsState = {
            type: 'error',
            message: 'Unable to load patterns: extension communication failed',
          };
          return;
        }

        if (response.type === 'internal.patternsList') {
          const allPatterns = response.patterns;
          const visiblePatterns = settings.visiblePatterns;

          const filteredPatterns = allPatterns.filter((pattern) =>
            visiblePatterns.includes(pattern)
          );
          const patterns = uiSettings.showCustomPrompt
            ? ['Custom', ...filteredPatterns]
            : filteredPatterns;
          patternsState = { type: 'loaded', patterns };

          if (settings.defaultPattern && filteredPatterns.includes(settings.defaultPattern)) {
            uiSettings.selectedPattern = settings.defaultPattern;
          } else if (!uiSettings.showCustomPrompt && uiSettings.selectedPattern === 'Custom') {
            uiSettings.selectedPattern = filteredPatterns.length > 0 ? filteredPatterns[0]! : '';
          } else if (!settings.defaultPattern) {
            const firstRecommended = RECOMMENDED_PATTERNS.find((pattern) =>
              filteredPatterns.includes(pattern)
            );
            if (firstRecommended) {
              uiSettings.selectedPattern = firstRecommended;
            }
          }
        }
      } catch (error) {
        console.error('Failed to load patterns:', error);
        patternsState = { type: 'error', message: 'Failed to load patterns' };
      }
    })();

    const handleMessage = (message: any) => {
      const requestId = getRequestId(processingState);
      if (message.id && message.id !== requestId) {
        return;
      }

      if (message.type === 'internal.processingContent') {
        if (processingState.type === 'processing' || processingState.type === 'cancelling') {
          processingState = {
            ...processingState,
            output: processingState.output + message.content,
          };
        }
      } else if (message.type === 'internal.processingDone') {
        if (processingState.type === 'processing' || processingState.type === 'cancelling') {
          processingState = { type: 'completed', output: processingState.output };
        }
      } else if (message.type === 'internal.processingError') {
        const currentOutput = getOutput(processingState);
        processingState = {
          type: 'error',
          message: message.message,
          output: currentOutput || undefined,
        };
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    const handleStorageChanged = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string
    ) => {
      if (area === 'local') {
        if (changes.showCustomPrompt && changes.showCustomPrompt.newValue !== undefined) {
          uiSettings.showCustomPrompt = changes.showCustomPrompt.newValue;

          if (patternsState.type === 'loaded') {
            let patterns = patternsState.patterns;
            if (uiSettings.showCustomPrompt && !patterns.includes('Custom')) {
              patterns = ['Custom', ...patterns.filter((p) => p !== 'Custom')];
            } else if (!uiSettings.showCustomPrompt && patterns.includes('Custom')) {
              patterns = patterns.filter((p) => p !== 'Custom');

              if (uiSettings.selectedPattern === 'Custom') {
                uiSettings.selectedPattern = patterns.length > 0 ? patterns[0]! : '';
              }
            }
            patternsState = { type: 'loaded', patterns };
          }
        }

        if (changes.renderAsMarkdown && changes.renderAsMarkdown.newValue !== undefined) {
          uiSettings.renderAsMarkdown = changes.renderAsMarkdown.newValue;
          uiSettings.localRenderAsMarkdown = changes.renderAsMarkdown.newValue;
        }

        if (changes.sendRawContent && changes.sendRawContent.newValue !== undefined) {
          uiSettings.sendRawContent = changes.sendRawContent.newValue;
        }

        if (changes.visiblePatterns && changes.visiblePatterns.newValue !== undefined) {
          const visiblePatterns = changes.visiblePatterns.newValue;

          const basePatterns = uiSettings.showCustomPrompt ? ['Custom'] : [];
          const patterns = [...basePatterns, ...visiblePatterns];
          patternsState = { type: 'loaded', patterns };

          if (uiSettings.selectedPattern && !patterns.includes(uiSettings.selectedPattern)) {
            const firstRecommended = RECOMMENDED_PATTERNS.find((pattern) =>
              visiblePatterns.includes(pattern)
            );
            uiSettings.selectedPattern =
              firstRecommended || (patterns.length > 0 ? patterns[0]! : '');
          }
        }

        if (changes.defaultPattern && changes.defaultPattern.newValue !== undefined) {
          const defaultPattern = changes.defaultPattern.newValue;
          if (
            defaultPattern &&
            patternsState.type === 'loaded' &&
            patternsState.patterns.includes(defaultPattern)
          ) {
            uiSettings.selectedPattern = defaultPattern;
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
      uiSettings.sendRawContent = checked;
      await saveSettings({ sendRawContent: checked });
    } catch (error) {
      console.error('Failed to save raw content setting:', error);
      uiSettings.sendRawContent = !checked;
    }
  }

  async function handleCancel(): Promise<void> {
    if (processingState.type !== 'processing') return;

    const idToCancel = processingState.requestId;
    const currentOutput = processingState.output;
    processingState = { type: 'cancelling', requestId: idToCancel, output: currentOutput };

    try {
      const response = await sendSafely({
        type: 'internal.cancelProcess',
        requestId: idToCancel,
      });

      if (response?.type === 'internal.processingCancelled' && response.id === idToCancel) {
        processingState = {
          type: 'error',
          message: 'Process was cancelled',
          output: currentOutput,
        };
      } else if (response?.type === 'internal.processingError') {
        if (response.message.includes('not found or already completed')) {
          processingState = { type: 'completed', output: currentOutput };
        } else {
          console.warn('Cancel request failed:', response.message);
          processingState = {
            type: 'error',
            message: `Failed to cancel: ${response.message}`,
            output: currentOutput,
          };
        }
      }
    } catch (error) {
      console.error('Failed to cancel process:', error);
      processingState = {
        type: 'error',
        message: 'An error occurred while trying to cancel the process.',
        output: currentOutput,
      };
    }
  }

  async function handleGo(): Promise<void> {
    if (isCurrentlyProcessing || (isCustomPattern && !uiSettings.customPrompt.trim())) return;

    try {
      const requestId = generateRequestId();
      processingState = { type: 'capturing', requestId };
      uiSettings.localRenderAsMarkdown = uiSettings.renderAsMarkdown;

      const pageResponse = await sendSafely({
        type: 'internal.capturePage',
        rawContent: uiSettings.sendRawContent,
      });
      if (!pageResponse) {
        processingState = {
          type: 'error',
          message: 'Unable to communicate with extension background',
        };
        return;
      }

      if (pageResponse.type === 'internal.processingError') {
        processingState = { type: 'error', message: pageResponse.message };
        return;
      }

      if (pageResponse.type === 'internal.pageContent') {
        processingState = { type: 'processing', requestId, output: '' };

        const processRequest = InternalRequestSchema.parse({
          type: 'internal.processContent',
          id: requestId,
          content: pageResponse.content,
          pattern: isCustomPattern ? undefined : uiSettings.selectedPattern,
          customPrompt: isCustomPattern ? uiSettings.customPrompt : undefined,
        });

        sendSafely(processRequest);
      }
    } catch (error) {
      processingState = {
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to process content',
      };
    }
  }
</script>

<div class="flex flex-col h-screen bg-base-100">
  <div class="flex-none border-b border-base-300 py-2 px-3">
    <div class="flex items-center justify-between">
      <h1 class="text-base font-semibold text-base-content">Tapestry</h1>
      <div class="flex items-center gap-2">
        {#if hasOutput(processingState)}
          <div
            class="tooltip tooltip-bottom"
            data-tip={uiSettings.localRenderAsMarkdown ? 'Show raw text' : 'Show as markdown'}
          >
            <button
              onclick={() => (uiSettings.localRenderAsMarkdown = !uiSettings.localRenderAsMarkdown)}
              class="btn btn-ghost btn-xs p-1 min-h-0 h-auto"
            >
              {#if uiSettings.localRenderAsMarkdown}
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
        bind:value={uiSettings.selectedPattern}
        patterns={availablePatterns}
        loading={patternsState.type === 'loading'}
        class="flex-1 text-sm"
      />

      <div class="tooltip tooltip-bottom" data-tip="Send page as raw HTML instead of markdown">
        <label class="label cursor-pointer gap-2 py-1 px-2 rounded hover:bg-base-200">
          <span class="label-text text-xs flex items-center gap-1">
            {#if uiSettings.sendRawContent}
              <Code2 size={12} />
            {:else}
              <FileText size={12} />
            {/if}
            Raw
          </span>
          <input
            type="checkbox"
            class="toggle toggle-xs toggle-primary"
            checked={uiSettings.sendRawContent}
            onchange={(e) => handleRawContentToggle(e.currentTarget.checked)}
          />
        </label>
      </div>

      {#if processingState.type === 'processing' || processingState.type === 'cancelling'}
        <button
          onclick={handleCancel}
          disabled={processingState.type === 'cancelling'}
          class="btn btn-error text-sm"
          class:loading={processingState.type === 'cancelling'}
        >
          <X size={16} />
          {processingState.type === 'cancelling' ? 'Cancelling...' : 'Cancel'}
        </button>
      {:else}
        <button
          onclick={handleGo}
          disabled={isCustomPattern && !uiSettings.customPrompt.trim()}
          class="btn btn-primary text-sm"
        >
          Go
        </button>
      {/if}
    </div>

    {#if isCustomPattern && uiSettings.showCustomPrompt}
      <div class="mt-2">
        <input
          type="text"
          bind:value={uiSettings.customPrompt}
          placeholder="Enter your custom prompt..."
          class="input input-bordered w-full text-sm"
        />
      </div>
    {/if}
  </div>

  <div class="flex-1 flex flex-col min-h-0">
    <div class="flex-1 p-2 bg-base-200">
      <div class="bg-base-300 rounded-lg h-full p-2 overflow-y-auto">
        {#if processingState.type === 'error'}
          <div class="text-sm text-error">{processingState.message}</div>
        {:else if processingState.type === 'capturing' || (processingState.type === 'processing' && !currentOutput)}
          <div class="flex items-center gap-2 text-sm text-base-content/60">
            <span class="loading loading-spinner loading-md text-primary"></span>
            <span class="italic">Processing current page...</span>
          </div>
        {:else if hasOutput(processingState)}
          {#if uiSettings.localRenderAsMarkdown}
            <MarkdownOutput content={currentOutput} />
          {:else}
            <pre
              class="text-sm text-base-content whitespace-pre-wrap font-mono overflow-y-auto max-w-none">{currentOutput}</pre>
          {/if}
        {:else}
          <div class="text-sm text-base-content/60 italic">
            Click "Go" to process the current page with Fabric
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
