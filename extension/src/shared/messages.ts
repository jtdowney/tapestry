import { z } from 'zod';

export const InternalRequestSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('internal.connectionStatus'),
  }),
  z.object({
    type: z.literal('internal.listPatterns'),
  }),
  z.object({
    type: z.literal('internal.listContexts'),
  }),
  z.object({
    type: z.literal('internal.capturePage'),
    rawContent: z.optional(z.boolean()),
  }),
  z.object({
    type: z.literal('internal.processContent'),
    content: z.string(),
    pattern: z.optional(z.string()),
    customPrompt: z.optional(z.string()),
  }),
  z.object({
    type: z.literal('internal.reconnectNative'),
  }),
]);

export const InternalResponseSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('internal.connectionStatus'),
    status: z.enum(['connected', 'disconnected']),
  }),
  z.object({
    type: z.literal('internal.patternsList'),
    patterns: z.array(z.string()),
  }),
  z.object({
    type: z.literal('internal.contextsList'),
    contexts: z.array(z.string()),
  }),
  z.object({
    type: z.literal('internal.pageContent'),
    content: z.string(),
  }),
  z.object({
    type: z.literal('internal.processingContent'),
    content: z.string(),
  }),
  z.object({
    type: z.literal('internal.processingDone'),
    exitCode: z.nullable(z.number()),
  }),
  z.object({
    type: z.literal('internal.processingError'),
    message: z.string(),
  }),
]);

export type InternalRequest = z.infer<typeof InternalRequestSchema>;
export type InternalResponse = z.infer<typeof InternalResponseSchema>;
