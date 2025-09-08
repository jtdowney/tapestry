import { z } from 'zod';

export const NativeResponseSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('native.pong'),
    id: z.uuid(),
    resolvedPath: z.optional(z.nullable(z.string())),
    version: z.optional(z.nullable(z.string())),
    valid: z.boolean(),
  }),
  z.object({
    type: z.literal('native.patternsList'),
    id: z.uuid(),
    patterns: z.array(z.string()),
  }),
  z.object({
    type: z.literal('native.contextsList'),
    id: z.uuid(),
    contexts: z.array(z.string()),
  }),
  z.object({
    type: z.literal('native.content'),
    id: z.uuid(),
    content: z.string(),
  }),
  z.object({
    type: z.literal('native.done'),
    id: z.uuid(),
    exitCode: z.optional(z.nullable(z.number())),
  }),
  z.object({
    type: z.literal('native.error'),
    id: z.uuid(),
    message: z.string(),
  }),
  z.object({
    type: z.literal('native.cancelled'),
    id: z.uuid(),
    requestId: z.uuid(),
  }),
]);

export type NativeResponse = z.infer<typeof NativeResponseSchema>;

export const NativeRequestSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('native.ping'),
    id: z.uuid(),
    path: z.optional(z.string()),
  }),
  z.object({
    type: z.literal('native.listPatterns'),
    id: z.uuid(),
    path: z.optional(z.string()),
  }),
  z.object({
    type: z.literal('native.listContexts'),
    id: z.uuid(),
    path: z.optional(z.string()),
  }),
  z.object({
    type: z.literal('native.processContent'),
    id: z.uuid(),
    content: z.string(),
    model: z.optional(z.string()),
    pattern: z.optional(z.string()),
    context: z.optional(z.string()),
    path: z.optional(z.string()),
    customPrompt: z.optional(z.string()),
  }),
  z.object({
    type: z.literal('native.cancelProcess'),
    id: z.uuid(),
    requestId: z.uuid(),
    path: z.optional(z.string()),
  }),
]);

export type NativeRequest = z.infer<typeof NativeRequestSchema>;
