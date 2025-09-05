export interface Settings {
  fabricPath: string;
  fabricModel: string;
  defaultPattern: string;
  visiblePatterns: string[];
  showCustomPrompt: boolean;
  renderAsMarkdown: boolean;
  sendRawContent: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  fabricPath: '',
  fabricModel: '',
  defaultPattern: '',
  visiblePatterns: [],
  showCustomPrompt: true,
  renderAsMarkdown: true,
  sendRawContent: false,
};

export async function loadSettings(): Promise<Settings> {
  try {
    const stored = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));

    return {
      fabricPath: stored.fabricPath ?? DEFAULT_SETTINGS.fabricPath,
      fabricModel: stored.fabricModel ?? DEFAULT_SETTINGS.fabricModel,
      defaultPattern: stored.defaultPattern ?? DEFAULT_SETTINGS.defaultPattern,
      visiblePatterns: Array.isArray(stored.visiblePatterns)
        ? stored.visiblePatterns
        : DEFAULT_SETTINGS.visiblePatterns,
      showCustomPrompt: stored.showCustomPrompt ?? DEFAULT_SETTINGS.showCustomPrompt,
      renderAsMarkdown: stored.renderAsMarkdown ?? DEFAULT_SETTINGS.renderAsMarkdown,
      sendRawContent: stored.sendRawContent ?? DEFAULT_SETTINGS.sendRawContent,
    };
  } catch (error) {
    console.error('Failed to load settings:', error);
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(updates: Partial<Settings>): Promise<void> {
  await chrome.storage.local.set(updates);
}

export async function saveLocal(updates: Partial<Settings>): Promise<void> {
  try {
    await chrome.storage.local.set(updates);
  } catch (error) {
    console.error('Failed to save settings:', error);
    throw error;
  }
}

export async function loadFabricSettings(): Promise<{ path?: string; model?: string }> {
  try {
    const stored = await chrome.storage.local.get(['fabricPath', 'fabricModel']);

    const result: { path?: string; model?: string } = {};

    if (stored.fabricPath) {
      result.path = stored.fabricPath;
    }

    if (stored.fabricModel) {
      result.model = stored.fabricModel;
    }

    return result;
  } catch (error) {
    console.error('Failed to load fabric settings:', error);
    return {};
  }
}

export function watchSettings(
  callback: (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => void
): () => void {
  const listener = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
    if (area === 'local') {
      callback(changes, area);
    }
  };

  chrome.storage.onChanged.addListener(listener);

  return () => {
    chrome.storage.onChanged.removeListener(listener);
  };
}

export function convertSetToArray<T>(set: Set<T>): T[] {
  return Array.from(set);
}

export function convertArrayToSet<T>(array: T[] | null | undefined): Set<T> {
  if (array == null) {
    return new Set<T>();
  }
  return new Set(array);
}
