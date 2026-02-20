import type { Context } from 'hono';
import { stream } from 'hono/streaming';
import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText, type CoreMessage } from 'ai';
import { createBashTool, createTextEditorTool } from './tools.js';
import { buildSystemPrompt } from './prompts.js';

const DEFAULT_MODEL = 'claude-opus-4-6';

/** Anthropic cache control — marks content as cacheable (ephemeral) */
const CACHE_CONTROL = {
  anthropic: { cacheControl: { type: 'ephemeral' as const } },
};

/**
 * Handle POST /api/chat — the core agentic loop.
 *
 * Uses Hono's stream helper to pipe the AI SDK data stream,
 * ensuring proper streaming through @hono/node-server.
 */
export async function handleChat(c: Context): Promise<Response> {
  const notesDir = process.env.NOTES_DIR;
  if (!notesDir) {
    return c.json({ error: 'NOTES_DIR environment variable is not set' }, 500);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return c.json(
      { error: 'ANTHROPIC_API_KEY environment variable is not set' },
      500,
    );
  }

  let body: { messages?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { messages } = body;
  if (!messages || !Array.isArray(messages)) {
    return c.json({ error: 'messages array is required' }, 400);
  }

  const modelId = process.env.MODEL || DEFAULT_MODEL;
  const anthropic = createAnthropic({ apiKey });
  const systemPrompt = await buildSystemPrompt(notesDir);

  // System message with prompt caching
  const systemMessage: CoreMessage = {
    role: 'system',
    content: systemPrompt,
    providerOptions: CACHE_CONTROL,
  };

  const result = streamText({
    model: anthropic(modelId),
    messages: [systemMessage, ...messages],
    tools: {
      bash: createBashTool(notesDir),
      text_editor: createTextEditorTool(notesDir),
    },
    maxSteps: 20,
    onError: ({ error }) => {
      console.error('[Nucleus] Stream error:', error);
    },
  });

  // Return the data stream response with detailed error messages.
  // By default, toDataStreamResponse masks errors as "An error occurred."
  // We override getErrorMessage to surface the actual error to the client.
  return result.toDataStreamResponse({
    getErrorMessage: (error) => {
      if (error instanceof Error) {
        // Surface API errors (auth, model not found, rate limit, etc.)
        return error.message;
      }
      return 'An unexpected error occurred';
    },
  });
}
