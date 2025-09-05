import { describe, it, expect } from 'vitest';

import { NativeRequestSchema, NativeResponseSchema } from './messages';

describe('Native Host Message Schema', () => {
  describe('NativeRequest Schema with native. prefix', () => {
    it('should validate native.ping request', () => {
      const request = {
        type: 'native.ping',
        id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        path: '/opt/fabric',
      };
      const result = NativeRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('should validate native.listPatterns request', () => {
      const request = {
        type: 'native.listPatterns',
        id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        path: '/opt/fabric',
      };
      const result = NativeRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('should validate native.processContent request', () => {
      const request = {
        type: 'native.processContent',
        id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        content: 'test content',
        model: 'gpt-4',
        pattern: 'summarize',
        path: '/opt/fabric',
        customPrompt: 'custom prompt',
      };
      const result = NativeRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('should reject old unprefixed request types', () => {
      const oldRequest = {
        type: 'ping',
        id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      };
      const result = NativeRequestSchema.safeParse(oldRequest);
      expect(result.success).toBe(false);
    });
  });

  describe('NativeResponse Schema with native. prefix', () => {
    it('should validate native.pong response', () => {
      const response = {
        type: 'native.pong',
        id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        resolvedPath: '/opt/fabric',
        version: '1.0.0',
        valid: true,
      };
      const result = NativeResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should validate native.patternsList response', () => {
      const response = {
        type: 'native.patternsList',
        id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        patterns: ['pattern1', 'pattern2'],
      };
      const result = NativeResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should validate native.content response', () => {
      const response = {
        type: 'native.content',
        id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        content: 'response content',
      };
      const result = NativeResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should validate native.done response', () => {
      const response = {
        type: 'native.done',
        id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        exitCode: 0,
      };
      const result = NativeResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should validate native.error response', () => {
      const response = {
        type: 'native.error',
        id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        message: 'error message',
      };
      const result = NativeResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should reject old unprefixed response types', () => {
      const oldResponse = {
        type: 'pong',
        id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        valid: true,
      };
      const result = NativeResponseSchema.safeParse(oldResponse);
      expect(result.success).toBe(false);
    });
  });
});
