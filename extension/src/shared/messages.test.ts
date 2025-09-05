import { describe, it, expect } from 'vitest';

import { InternalRequestSchema, InternalResponseSchema } from './messages';

describe('Extension Internal Message Schema', () => {
  describe('Request Schema with internal. prefix', () => {
    it('should validate internal.connection_status request', () => {
      const request = { type: 'internal.connection_status' };
      const result = InternalRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('should validate internal.list_patterns request', () => {
      const request = { type: 'internal.list_patterns' };
      const result = InternalRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('should validate internal.capture_page request', () => {
      const request = { type: 'internal.capture_page' };
      const result = InternalRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('should validate internal.process_content request', () => {
      const request = {
        type: 'internal.process_content',
        content: 'test content',
        pattern: 'test-pattern',
        customPrompt: 'test prompt',
      };
      const result = InternalRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('should validate internal.reconnect_native request', () => {
      const request = { type: 'internal.reconnect_native' };
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
    it('should validate internal.connection_status response', () => {
      const response = {
        type: 'internal.connection_status',
        status: 'connected',
      };
      const result = InternalResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should validate internal.patterns_list response', () => {
      const response = {
        type: 'internal.patterns_list',
        patterns: ['pattern1', 'pattern2'],
      };
      const result = InternalResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should validate internal.page_content response', () => {
      const response = {
        type: 'internal.page_content',
        content: 'page content',
      };
      const result = InternalResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should validate internal.processing_content response', () => {
      const response = {
        type: 'internal.processing_content',
        content: 'processing content',
      };
      const result = InternalResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should validate internal.processing_done response', () => {
      const response = {
        type: 'internal.processing_done',
        exitCode: 0,
      };
      const result = InternalResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should validate internal.processing_error response', () => {
      const response = {
        type: 'internal.processing_error',
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
