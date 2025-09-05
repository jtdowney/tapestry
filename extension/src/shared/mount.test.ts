import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from 'svelte';

import { mountApp, handleDOMReady } from './mount';

vi.mock('svelte', () => ({
  mount: vi.fn(),
}));

const mockMount = vi.mocked(mount);

describe('mountApp', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should mount component to default app element', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const mockComponent = {} as any;
    const mockInstance = {};
    mockMount.mockReturnValue(mockInstance);

    const result = mountApp(mockComponent);

    expect(mockMount).toHaveBeenCalledWith(mockComponent, {
      target: document.getElementById('app'),
    });
    expect(result).toBe(mockInstance);
  });

  it('should mount component to custom element', () => {
    document.body.innerHTML = '<div id="custom"></div>';
    const mockComponent = {} as any;
    const mockInstance = {};
    mockMount.mockReturnValue(mockInstance);

    const result = mountApp(mockComponent, 'custom');

    expect(mockMount).toHaveBeenCalledWith(mockComponent, {
      target: document.getElementById('custom'),
    });
    expect(result).toBe(mockInstance);
  });

  it('should log error and return undefined when element not found', () => {
    const mockComponent = {} as any;
    const consoleError = vi.spyOn(console, 'error');

    const result = mountApp(mockComponent, 'nonexistent');

    expect(consoleError).toHaveBeenCalledWith(
      'Could not find #nonexistent element to mount component'
    );
    expect(mockMount).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it('should log error for default element when not found', () => {
    const mockComponent = {} as any;
    const consoleError = vi.spyOn(console, 'error');

    const result = mountApp(mockComponent);

    expect(consoleError).toHaveBeenCalledWith('Could not find #app element to mount component');
    expect(mockMount).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it('should handle mount function throwing error', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const mockComponent = {} as any;
    const error = new Error('Mount failed');
    mockMount.mockImplementation(() => {
      throw error;
    });

    expect(() => mountApp(mockComponent)).toThrow('Mount failed');
  });
});

describe('handleDOMReady', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call mountFn immediately when DOM is ready', () => {
    Object.defineProperty(document, 'readyState', {
      writable: true,
      value: 'complete',
    });

    const mountFn = vi.fn();
    handleDOMReady(mountFn);

    expect(mountFn).toHaveBeenCalledTimes(1);
  });

  it('should call mountFn immediately when DOM is interactive', () => {
    Object.defineProperty(document, 'readyState', {
      writable: true,
      value: 'interactive',
    });

    const mountFn = vi.fn();
    handleDOMReady(mountFn);

    expect(mountFn).toHaveBeenCalledTimes(1);
  });

  it('should add event listener when DOM is loading', () => {
    Object.defineProperty(document, 'readyState', {
      writable: true,
      value: 'loading',
    });

    const mockAddEventListener = vi.spyOn(document, 'addEventListener');
    const mountFn = vi.fn();

    handleDOMReady(mountFn);

    expect(mountFn).not.toHaveBeenCalled();
    expect(mockAddEventListener).toHaveBeenCalledWith('DOMContentLoaded', mountFn);
  });

  it('should call mountFn when DOMContentLoaded fires', () => {
    Object.defineProperty(document, 'readyState', {
      writable: true,
      value: 'loading',
    });

    const mountFn = vi.fn();
    handleDOMReady(mountFn);

    expect(mountFn).not.toHaveBeenCalled();

    // Simulate DOMContentLoaded event
    const event = new Event('DOMContentLoaded');
    document.dispatchEvent(event);

    expect(mountFn).toHaveBeenCalledTimes(1);
  });

  it('should handle multiple calls', () => {
    Object.defineProperty(document, 'readyState', {
      writable: true,
      value: 'complete',
    });

    const mountFn1 = vi.fn();
    const mountFn2 = vi.fn();

    handleDOMReady(mountFn1);
    handleDOMReady(mountFn2);

    expect(mountFn1).toHaveBeenCalledTimes(1);
    expect(mountFn2).toHaveBeenCalledTimes(1);
  });

  it('should handle mountFn throwing error', () => {
    Object.defineProperty(document, 'readyState', {
      writable: true,
      value: 'complete',
    });

    const mountFn = vi.fn().mockImplementation(() => {
      throw new Error('Mount function failed');
    });

    expect(() => handleDOMReady(mountFn)).toThrow('Mount function failed');
  });
});
