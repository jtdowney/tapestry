export type ProcessingState =
  | { type: 'idle' }
  | { type: 'capturing'; requestId: string }
  | { type: 'processing'; requestId: string; output: string }
  | { type: 'cancelling'; requestId: string; output: string }
  | { type: 'completed'; output: string }
  | { type: 'error'; message: string; output?: string };

export type PatternsState =
  | { type: 'loading' }
  | { type: 'loaded'; patterns: string[] }
  | { type: 'error'; message: string };

export interface UISettings {
  selectedPattern: string;
  customPrompt: string;
  showCustomPrompt: boolean;
  renderAsMarkdown: boolean;
  localRenderAsMarkdown: boolean;
  sendRawContent: boolean;
}

export function isProcessing(state: ProcessingState): boolean {
  return state.type === 'capturing' || state.type === 'processing' || state.type === 'cancelling';
}

export function hasOutput(state: ProcessingState): boolean {
  return (
    state.type === 'processing' ||
    state.type === 'cancelling' ||
    state.type === 'completed' ||
    (state.type === 'error' && state.output !== undefined)
  );
}

export function getOutput(state: ProcessingState): string {
  switch (state.type) {
    case 'processing':
    case 'cancelling':
    case 'completed':
      return state.output;
    case 'error':
      return state.output ?? '';
    default:
      return '';
  }
}

export function getRequestId(state: ProcessingState): string | null {
  switch (state.type) {
    case 'capturing':
    case 'processing':
    case 'cancelling':
      return state.requestId;
    default:
      return null;
  }
}
