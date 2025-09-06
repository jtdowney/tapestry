<script lang="ts">
  import { CircleCheck, X, LoaderCircle } from '@lucide/svelte';
  import { onMount } from 'svelte';

  import ConnectionStatus from '$shared/components/ConnectionStatus.svelte';
  import { sendSafely, getConnectionStatus } from '$shared/connection';
  import { RECOMMENDED_PATTERNS } from '$shared/constants';
  import { debounce } from '$shared/debounce';
  import { loadSettings, saveSettings, type Settings } from '$shared/settings';

  let availablePatterns = $state<string[]>([]);
  let availableContexts = $state<string[]>([]);
  let saveStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
  let connectionStatus = $state<'connected' | 'disconnected' | 'checking'>('checking');

  let settings = $state<Settings | undefined>(undefined);
  let visiblePatternsSet = $state<Set<string>>(new Set());

  onMount(async () => {
    try {
      settings = await loadSettings();

      if (settings) {
        visiblePatternsSet = new Set(settings.visiblePatterns);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
    await loadAvailableOptions();
    await checkConnectionStatus();
  });

  $effect(() => {
    if (settings) {
      visiblePatternsSet = new Set(settings.visiblePatterns);
    }
  });

  $effect(() => {
    function handleConnectionUpdate(message: any): void {
      if (message.type === 'internal.connection_status') {
        const previousStatus = connectionStatus;
        connectionStatus = message.status;

        if (previousStatus === 'disconnected' && message.status === 'connected') {
          console.log('Connection restored, reloading patterns...');
          loadAvailableOptions();
        }
      }
    }

    chrome.runtime.onMessage.addListener(handleConnectionUpdate);

    return () => {
      chrome.runtime.onMessage.removeListener(handleConnectionUpdate);
    };
  });

  async function checkConnectionStatus(): Promise<void> {
    try {
      connectionStatus = await getConnectionStatus();
    } catch (error) {
      console.error('Failed to check connection status:', error);
      connectionStatus = 'disconnected';
    }
  }

  async function loadAvailableOptions(): Promise<void> {
    try {
      // Load patterns
      const patternsResponse = await sendSafely({ type: 'internal.list_patterns' });
      if (patternsResponse?.type === 'internal.patterns_list') {
        availablePatterns = patternsResponse.patterns;

        if (settings && settings.visiblePatterns.length === 0 && availablePatterns.length > 0) {
          const recommendedVisible = availablePatterns.filter((pattern) =>
            RECOMMENDED_PATTERNS.includes(pattern as (typeof RECOMMENDED_PATTERNS)[number])
          );
          await saveSettingsImmediate({ visiblePatterns: recommendedVisible });
        }
      }

      // Load contexts
      const contextsResponse = await sendSafely({ type: 'internal.list_contexts' });
      if (contextsResponse?.type === 'internal.contexts_list') {
        availableContexts = contextsResponse.contexts;
      }
    } catch (error) {
      console.error('Failed to load available options:', error);
    }
  }

  async function saveSettingsImmediate(updates: Partial<Settings>): Promise<void> {
    if (!settings) return;
    saveStatus = 'saving';
    try {
      const newSettings = { ...settings, ...updates };
      const fabricPathChanged =
        updates.fabricPath !== undefined && updates.fabricPath !== settings?.fabricPath;

      await saveSettings(updates);
      settings = newSettings;

      if (fabricPathChanged) {
        console.log('Fabric path changed, triggering reconnection');
        sendSafely({ type: 'internal.reconnect_native' });
      }

      saveStatus = 'saved';
      setTimeout(() => (saveStatus = 'idle'), 2000);
    } catch (error) {
      console.error('Failed to save settings:', error);
      saveStatus = 'error';
      setTimeout(() => (saveStatus = 'idle'), 2000);
    }
  }

  const debouncedSaveSettings = debounce(saveSettingsImmediate, 500);

  function togglePatternVisibility(patternName: string): void {
    if (!settings) return;

    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const newVisiblePatternsSet = new Set(visiblePatternsSet);
    const isVisible = newVisiblePatternsSet.has(patternName);

    if (isVisible) {
      newVisiblePatternsSet.delete(patternName);
      const updates: Partial<Settings> = {
        visiblePatterns: Array.from(newVisiblePatternsSet),
      };

      if (settings.defaultPattern === patternName) {
        updates.defaultPattern = '';
      }

      saveSettingsImmediate(updates);
    } else {
      newVisiblePatternsSet.add(patternName);
      saveSettingsImmediate({
        visiblePatterns: Array.from(newVisiblePatternsSet),
      });
    }
  }

  function selectAllPatterns(): void {
    const allPatternsSet = new Set(availablePatterns);
    saveSettingsImmediate({ visiblePatterns: Array.from(allPatternsSet) });
  }

  function deselectAllPatterns(): void {
    saveSettingsImmediate({
      visiblePatterns: [],
      defaultPattern: '',
    });
  }

  function selectRecommendedPatterns(): void {
    const availablePatternsSet = new Set(availablePatterns);
    const recommendedSet = new Set(
      RECOMMENDED_PATTERNS.filter((pattern) => availablePatternsSet.has(pattern))
    );
    saveSettingsImmediate({ visiblePatterns: Array.from(recommendedSet) });
  }

  function getVisiblePatternsForDefault(): string[] {
    return settings?.visiblePatterns ?? [];
  }
</script>

<div class="min-h-screen flex flex-col">
  <header class="p-8 pb-0">
    <h1 class="text-3xl font-semibold mb-2">Tapestry Preferences</h1>
    <p class="text-base-content/70">Configure your Fabric AI integration settings</p>
  </header>

  <main class="flex-1 p-8">
    {#if !settings}
      <div class="flex items-center justify-center h-full">
        <div class="loading loading-spinner loading-lg"></div>
      </div>
    {:else}
      <div class="tabs tabs-lift tabs-lg">
        <input type="radio" name="settings_tabs" class="tab" aria-label="General" checked />
        <div class="tab-content bg-base-100 border-base-300 p-8">
          <section>
            <div class="flex items-center justify-between mb-6">
              <h2 class="text-xl font-semibold">Fabric Configuration</h2>
              <ConnectionStatus />
            </div>

            <div class="form-control mb-5 max-w-md">
              <label class="label" for="fabricPath">
                <span class="label-text font-medium">Fabric Path</span>
              </label>
              <input
                id="fabricPath"
                type="text"
                class="input input-bordered w-full"
                placeholder="/usr/local/bin/fabric or C:\Path\To\fabric.exe"
                value={settings.fabricPath}
                oninput={(e) => debouncedSaveSettings({ fabricPath: e.currentTarget.value })}
              />
              <div class="label">
                <span class="label-text-alt text-base-content/60">
                  Full path to the Fabric executable on your system
                </span>
              </div>
            </div>

            <div class="form-control mb-5 max-w-md">
              <label class="label" for="model">
                <span class="label-text font-medium">Default Model</span>
              </label>
              <input
                id="model"
                type="text"
                class="input input-bordered w-full"
                placeholder="Leave empty to use fabric's default (optional)"
                value={settings.fabricModel}
                oninput={(e) => debouncedSaveSettings({ fabricModel: e.currentTarget.value })}
              />
              <div class="label">
                <span class="label-text-alt text-base-content/60">
                  Optional: Specify a model like gpt-4o, claude-3-5-sonnet, etc.
                </span>
              </div>
            </div>

            <div class="form-control mb-5 max-w-md">
              <label class="label" for="context">
                <span class="label-text font-medium">Default Context</span>
              </label>
              <select
                id="context"
                class="select select-bordered w-full"
                value={settings.fabricContext}
                onchange={(e) => debouncedSaveSettings({ fabricContext: e.currentTarget.value })}
              >
                <option value="">None (no context)</option>
                {#each availableContexts as context (context)}
                  <option value={context}>{context}</option>
                {/each}
              </select>
              <div class="label">
                <span class="label-text-alt text-base-content/60">
                  Optional: Choose a context to apply to all requests (e.g., tapestry for markdown
                  output)
                </span>
              </div>
            </div>
          </section>
        </div>

        <input type="radio" name="settings_tabs" class="tab" aria-label="Sidebar" />
        <div class="tab-content bg-base-100 border-base-300 p-8">
          <section>
            <h2 class="text-xl font-semibold mb-6">Sidebar Configuration</h2>

            <div class="mb-8">
              <div class="form-control max-w-xs">
                <label class="label" for="pattern">
                  <span class="label-text font-medium">Default Pattern</span>
                </label>
                <select
                  id="pattern"
                  class="select select-bordered w-full"
                  value={settings.defaultPattern}
                  onchange={(e) => saveSettingsImmediate({ defaultPattern: e.currentTarget.value })}
                >
                  <option value="">None (prompt each time)</option>
                  {#each getVisiblePatternsForDefault() as pattern (pattern)}
                    <option value={pattern}>{pattern}</option>
                  {/each}
                </select>
                <div class="label">
                  <span class="label-text-alt text-base-content/60">
                    {#if visiblePatternsSet.size === 0}
                      Select patterns below to populate this dropdown
                    {:else}
                      Choose from visible patterns below
                    {/if}
                  </span>
                </div>
              </div>
            </div>

            <div class="mb-8">
              <h3 class="text-lg font-semibold mb-4">Custom Prompts</h3>
              <label
                class="cursor-pointer flex items-center gap-2 p-3 rounded-lg hover:bg-base-200 max-w-lg"
              >
                <input
                  type="checkbox"
                  class="checkbox checkbox-sm flex-shrink-0"
                  checked={settings.showCustomPrompt}
                  onchange={(e) =>
                    saveSettingsImmediate({ showCustomPrompt: e.currentTarget.checked })}
                />
                <div class="flex-1">
                  <span class="text-sm font-medium">Show custom prompt option</span>
                  <div class="text-xs text-base-content/60 mt-1">
                    Display "Custom" option in pattern selector for entering custom prompts
                  </div>
                </div>
              </label>
            </div>

            <div class="mb-8">
              <h3 class="text-lg font-semibold mb-4">Output Formatting</h3>

              <div class="space-y-2">
                <label
                  class="cursor-pointer flex items-center gap-2 p-3 rounded-lg hover:bg-base-200 max-w-lg"
                >
                  <input
                    type="checkbox"
                    class="checkbox checkbox-sm flex-shrink-0"
                    checked={settings.renderAsMarkdown}
                    onchange={(e) =>
                      saveSettingsImmediate({ renderAsMarkdown: e.currentTarget.checked })}
                  />
                  <div class="flex-1">
                    <span class="text-sm font-medium">Render responses as markdown</span>
                    <div class="text-xs text-base-content/60 mt-1">
                      Enable rich formatting (headings, lists, code blocks). Disable for plain text
                      output
                    </div>
                  </div>
                </label>

                <label
                  class="cursor-pointer flex items-center gap-2 p-3 rounded-lg hover:bg-base-200 max-w-lg"
                >
                  <input
                    type="checkbox"
                    class="checkbox checkbox-sm flex-shrink-0"
                    checked={settings.sendRawContent}
                    onchange={(e) =>
                      saveSettingsImmediate({ sendRawContent: e.currentTarget.checked })}
                  />
                  <div class="flex-1">
                    <span class="text-sm font-medium">Send raw HTML content</span>
                    <div class="text-xs text-base-content/60 mt-1">
                      Send original HTML instead of converted markdown. Useful for patterns that
                      need to preserve all formatting and structure
                    </div>
                  </div>
                </label>
              </div>
            </div>

            <div data-testid="pattern-visibility-section">
              <h3 class="text-lg font-semibold mb-4">Pattern Visibility</h3>
              <p class="text-base-content/70 mb-6">
                Control which patterns appear in the sidebar dropdown. Uncheck patterns to hide
                them.
              </p>

              <div class="mb-6">
                <div class="flex gap-2 mb-4">
                  <button
                    class="btn btn-outline btn-sm"
                    onclick={selectAllPatterns}
                    data-testid="select-all-btn"
                  >
                    Select All
                  </button>
                  <button
                    class="btn btn-outline btn-sm"
                    onclick={selectRecommendedPatterns}
                    data-testid="select-recommended-btn"
                  >
                    Select Recommended
                  </button>
                  <button
                    class="btn btn-outline btn-sm"
                    onclick={deselectAllPatterns}
                    data-testid="deselect-all-btn"
                  >
                    Deselect All
                  </button>
                </div>

                <div class="text-sm text-base-content/60 mb-4" data-testid="pattern-count">
                  {visiblePatternsSet.size} of {availablePatterns.length} patterns selected
                  {#if visiblePatternsSet.size === 0}
                    <span class="text-warning">(no patterns will be shown in sidebar)</span>
                  {/if}
                </div>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-w-4xl">
                {#each availablePatterns as pattern (pattern)}
                  <label
                    class="cursor-pointer flex items-center gap-2 p-3 rounded-lg hover:bg-base-200 border border-base-300 min-w-0"
                  >
                    <input
                      type="checkbox"
                      class="checkbox checkbox-sm flex-shrink-0"
                      checked={visiblePatternsSet.has(pattern)}
                      onchange={() => togglePatternVisibility(pattern)}
                    />
                    <span class="text-sm truncate" title={pattern}>{pattern}</span>
                  </label>
                {/each}
              </div>

              {#if availablePatterns.length === 0}
                <div class="text-center py-8 text-base-content/60">
                  <p>No patterns found. Make sure Fabric is installed and configured correctly.</p>
                </div>
              {/if}
            </div>
          </section>
        </div>
      </div>
    {/if}
  </main>

  <footer class="p-4 border-t border-base-300 bg-base-200/50">
    <div
      class="transition-opacity duration-300 {saveStatus !== 'idle' ? 'opacity-100' : 'opacity-0'}"
    >
      {#if saveStatus === 'saving'}
        <div class="flex items-center gap-2 text-info">
          <LoaderCircle size={16} class="animate-spin" />
          <span>Saving...</span>
        </div>
      {:else if saveStatus === 'saved'}
        <div class="flex items-center gap-2 text-success">
          <CircleCheck size={16} />
          <span>Settings saved</span>
        </div>
      {:else if saveStatus === 'error'}
        <div class="flex items-center gap-2 text-error">
          <X size={16} />
          <span>Failed to save</span>
        </div>
      {/if}
    </div>
  </footer>
</div>
