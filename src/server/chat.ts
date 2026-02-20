import type { Context } from 'hono';
import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { createBashTool, createTextEditorTool } from './tools.js';
import { buildSystemPrompt } from './prompts.js';

const DEFAULT_MODEL = 'claude-opus-4-6';

/**
 * Handle POST /api/chat — the core agentic loop.
 *
 * Receives messages in the Vercel AI SDK `useChat` format,
 * streams back a response with tool calls and text.
 */
export async function handleChat(c: Context): Promise<Response> {
  const notesDir = process.env.NOTES_DIR;
  if (!notesDir) {
    return c.json(
      { error: 'NOTES_DIR environment variable is not set' },
      500,
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return c.json(
      { error: 'ANTHROPIC_API_KEY environment variable is not set' },
      500,
    );
  }

  const body = await c.req.json();
  const { messages } = body;

  if (!messages || !Array.isArray(messages)) {
    return c.json({ error: 'messages array is required' }, 400);
  }

  const modelId = process.env.MODEL || DEFAULT_MODEL;
  const anthropic = createAnthropic({ apiKey });
  const system = await buildSystemPrompt(notesDir);

  const result = streamText({
    model: anthropic(modelId),
    system,
    messages,
    tools: {
      bash: createBashTool(notesDir),
      text_editor: createTextEditorTool(notesDir),
    },
    maxSteps: 20,
  });

  return result.toDataStreamResponse();
}
