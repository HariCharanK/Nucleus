import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV1 } from 'ai';

export type ProviderName = 'anthropic' | 'openai';

const DEFAULT_MODELS: Record<ProviderName, string> = {
  anthropic: 'claude-opus-4-6',
  openai: 'gpt-5',
};

const API_KEY_VARS: Record<ProviderName, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
};

/**
 * Pick the provider: PROVIDER if set, otherwise whichever API key is present
 * (Anthropic wins if both are set).
 */
export function resolveProvider(
  env: NodeJS.ProcessEnv = process.env,
): ProviderName {
  const explicit = env.PROVIDER?.trim().toLowerCase();
  if (explicit === 'anthropic' || explicit === 'openai') return explicit;
  if (env.ANTHROPIC_API_KEY) return 'anthropic';
  if (env.OPENAI_API_KEY) return 'openai';
  return 'anthropic';
}

export function resolveModelId(env: NodeJS.ProcessEnv = process.env): string {
  return env.MODEL || DEFAULT_MODELS[resolveProvider(env)];
}

export function apiKeyVar(env: NodeJS.ProcessEnv = process.env): string {
  return API_KEY_VARS[resolveProvider(env)];
}

export function hasApiKey(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!env[apiKeyVar(env)];
}

/** Build the language model for the configured provider. */
export function createModel(
  env: NodeJS.ProcessEnv = process.env,
): LanguageModelV1 {
  const provider = resolveProvider(env);
  const apiKey = env[API_KEY_VARS[provider]];
  const modelId = resolveModelId(env);
  if (provider === 'openai') {
    // Strict schemas require every property to be required, which breaks
    // the text_editor tool's optional params.
    return createOpenAI({ apiKey })(modelId, { structuredOutputs: false });
  }
  return createAnthropic({ apiKey })(modelId);
}
