import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { debounce } from './debounce';

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should delay function execution', () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 100);

    debouncedFn();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should cancel previous execution when called again within delay', () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 100);

    debouncedFn();
    vi.advanceTimersByTime(50);
    debouncedFn(); // Should cancel the first call

    vi.advanceTimersByTime(50); // Only 50ms after second call
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50); // Now 100ms after second call
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should forward arguments to the debounced function', () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 100);

    debouncedFn('arg1', 42, { test: true });
    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledWith('arg1', 42, { test: true });
  });

  it('should use the latest arguments when called multiple times', () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 100);

    debouncedFn('first');
    vi.advanceTimersByTime(50);
    debouncedFn('second');
    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('second');
  });

  it('should handle multiple sequential calls after delay', () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 100);

    // First call
    debouncedFn('first');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('first');

    // Second call
    debouncedFn('second');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenCalledWith('second');
  });

  it('should handle rapid succession of calls', () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 100);

    // Rapid calls
    debouncedFn('call1');
    debouncedFn('call2');
    debouncedFn('call3');
    debouncedFn('call4');
    debouncedFn('final');

    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('final');
  });

  it('should reset timeout ID after execution', () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 100);

    debouncedFn();
    vi.advanceTimersByTime(100);

    // Call again - should work normally
    debouncedFn('second');
    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should work with zero delay', () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 0);

    debouncedFn('test');
    vi.advanceTimersByTime(0);

    expect(fn).toHaveBeenCalledWith('test');
  });

  it('should work with different delay times', () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 500);

    debouncedFn();
    vi.advanceTimersByTime(499);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
