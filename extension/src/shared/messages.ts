import { z } from 'zod';

export const InternalRequestSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('internal.connection_status'),
  }),
  z.object({
    type: z.literal('internal.list_patterns'),
  }),
  z.object({
    type: z.literal('internal.capture_page'),
    rawContent: z.optional(z.boolean()),
  }),
  z.object({
    type: z.literal('internal.process_content'),
    content: z.string(),
    pattern: z.optional(z.string()),
    customPrompt: z.optional(z.string()),
  }),
  z.object({
    type: z.literal('internal.reconnect_native'),
  }),
]);

export const InternalResponseSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('internal.connection_status'),
    status: z.enum(['connected', 'disconnected']),
  }),
  z.object({
    type: z.literal('internal.patterns_list'),
    patterns: z.array(z.string()),
  }),
  z.object({
    type: z.literal('internal.page_content'),
    content: z.string(),
  }),
  z.object({
    type: z.literal('internal.processing_content'),
    content: z.string(),
  }),
  z.object({
    type: z.literal('internal.processing_done'),
    exitCode: z.nullable(z.number()),
  }),
  z.object({
    type: z.literal('internal.processing_error'),
    message: z.string(),
  }),
]);

export type InternalRequest = z.infer<typeof InternalRequestSchema>;
export type InternalResponse = z.infer<typeof InternalResponseSchema>;
