import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { generateRequestId } from './requestId';

vi.unmock('$shared/requestId');

describe('generateRequestId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should generate a valid UUID v4', () => {
    const id = generateRequestId();

    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(id).toMatch(uuidV4Regex);
  });

  it('should generate unique IDs', () => {
    const id1 = generateRequestId();
    const id2 = generateRequestId();
    const id3 = generateRequestId();

    expect(id1).not.toBe(id2);
    expect(id2).not.toBe(id3);
    expect(id1).not.toBe(id3);
  });

  it('should return a string', () => {
    const id = generateRequestId();
    expect(typeof id).toBe('string');
  });

  it('should generate IDs of correct length', () => {
    const id = generateRequestId();
    // Standard UUID length is 36 characters (32 hex + 4 hyphens)
    expect(id).toHaveLength(36);
  });

  it('should handle multiple rapid calls', () => {
    const ids = [generateRequestId(), generateRequestId(), generateRequestId()];

    // All should be unique
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(3);

    // All should be valid UUIDs
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    ids.forEach((id) => {
      expect(id).toMatch(uuidV4Regex);
    });
  });
});
