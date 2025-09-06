import { describe, it, expect } from 'vitest';

import { InternalRequestSchema, InternalResponseSchema } from './messages';

describe('Extension Internal Message Schema', () => {
  describe('Request Schema with internal. prefix', () => {
    it('should validate internal.connectionStatus request', () => {
      const request = { type: 'internal.connectionStatus' };
      const result = InternalRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('should validate internal.listPatterns request', () => {
      const request = { type: 'internal.listPatterns' };
      const result = InternalRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('should validate internal.capturePage request', () => {
      const request = { type: 'internal.capturePage' };
      const result = InternalRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('should validate internal.processContent request', () => {
      const request = {
        type: 'internal.processContent',
        content: 'test content',
        pattern: 'test-pattern',
        customPrompt: 'test prompt',
      };
      const result = InternalRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('should validate internal.reconnectNative request', () => {
      const request = { type: 'internal.reconnectNative' };
      const result = InternalRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('should reject old unprefixed request types', () => {
      const oldRequest = { type: 'connection_status' };
      const result = InternalRequestSchema.safeParse(oldRequest);
      expect(result.success).toBe(false);
    });
  });

  describe('Response Schema with internal. prefix', () => {
    it('should validate internal.connectionStatus response', () => {
      const response = {
        type: 'internal.connectionStatus',
        status: 'connected',
      };
      const result = InternalResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should validate internal.patternsList response', () => {
      const response = {
        type: 'internal.patternsList',
        patterns: ['pattern1', 'pattern2'],
      };
      const result = InternalResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should validate internal.pageContent response', () => {
      const response = {
        type: 'internal.pageContent',
        content: 'page content',
      };
      const result = InternalResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should validate internal.processingContent response', () => {
      const response = {
        type: 'internal.processingContent',
        content: 'processing content',
      };
      const result = InternalResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should validate internal.processingDone response', () => {
      const response = {
        type: 'internal.processingDone',
        exitCode: 0,
      };
      const result = InternalResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should validate internal.processingError response', () => {
      const response = {
        type: 'internal.processingError',
        message: 'error message',
      };
      const result = InternalResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should reject old unprefixed response types', () => {
      const oldResponse = { type: 'patterns_list', patterns: [] };
      const result = InternalResponseSchema.safeParse(oldResponse);
      expect(result.success).toBe(false);
    });
  });
});
