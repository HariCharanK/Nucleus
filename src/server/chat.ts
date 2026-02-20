import type { Context } from 'hono';
import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText, type CoreMessage } from 'ai';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { createBashTool, createTextEditorTool } from './tools.js';
import { buildSystemPrompt } from './prompts.js';

const DEFAULT_MODEL = 'claude-opus-4-6';

/** Anthropic cache control — marks content as cacheable (ephemeral) */
const CACHE_CONTROL = {
  anthropic: { cacheControl: { type: 'ephemeral' as const } },
};

/**
 * Extract text-only parts from conversation messages.
 * Skips tool calls, reasoning, and other non-text parts.
 */
function extractConversationText(messages: any[]): string {
  const lines: string[] = [];
  for (const msg of messages) {
    const role = msg.role === 'user' ? 'User' : 'Nucleus';
    // Handle string content (simple messages)
    if (typeof msg.content === 'string' && msg.content.trim()) {
      lines.push(`${role}: ${msg.content.trim()}`);
      continue;
    }
    // Handle parts array (rich messages from useChat)
    if (Array.isArray(msg.parts)) {
      const textParts = msg.parts
        .filter((p: any) => p.type === 'text' && p.text?.trim())
        .map((p: any) => p.text.trim());
      if (textParts.length > 0) {
        lines.push(`${role}: ${textParts.join('\n')}`);
      }
    }
  }
  return lines.join('\n\n');
}

/**
 * Write the conversation text to .nucleus/current-conversation.md
 * so the agent can reference it when making git commits.
 */
function writeConversationFile(notesDir: string, messages: any[]): void {
  const text = extractConversationText(messages);
  if (!text) return;
  const nucleusDir = resolve(notesDir, '.nucleus');
  mkdirSync(nucleusDir, { recursive: true });
  writeFileSync(
    resolve(nucleusDir, 'current-conversation.md'),
    text,
    'utf-8',
  );
}

/**
 * Handle POST /api/chat — the core agentic loop.
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

  // Write conversation text to .nucleus/ for git commit context
  writeConversationFile(notesDir, messages);

  const modelId = process.env.MODEL || DEFAULT_MODEL;
  const anthropic = createAnthropic({ apiKey });
  const systemPrompt = await buildSystemPrompt(notesDir);

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

  return result.toDataStreamResponse({
    getErrorMessage: (error) => {
      if (error instanceof Error) return error.message;
      return 'An unexpected error occurred';
    },
  });
}
