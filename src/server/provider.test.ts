import { describe, it, expect } from 'vitest';
import {
  apiKeyVar,
  createModel,
  hasApiKey,
  resolveModelId,
  resolveProvider,
} from './provider.js';

describe('resolveProvider', () => {
  it('uses PROVIDER when set', () => {
    expect(
      resolveProvider({ PROVIDER: 'OpenAI', ANTHROPIC_API_KEY: 'a' }),
    ).toBe('openai');
  });

  it('falls back to whichever API key is present', () => {
    expect(resolveProvider({ OPENAI_API_KEY: 'o' })).toBe('openai');
    expect(resolveProvider({ ANTHROPIC_API_KEY: 'a' })).toBe('anthropic');
  });

  it('prefers Anthropic when both keys are set', () => {
    expect(
      resolveProvider({ ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'o' }),
    ).toBe('anthropic');
  });

  it('defaults to Anthropic with no keys', () => {
    expect(resolveProvider({})).toBe('anthropic');
  });
});

describe('resolveModelId', () => {
  it('uses the provider default model', () => {
    expect(resolveModelId({ OPENAI_API_KEY: 'o' })).toBe('gpt-5');
    expect(resolveModelId({ ANTHROPIC_API_KEY: 'a' })).toBe('claude-opus-4-6');
  });

  it('respects MODEL', () => {
    expect(resolveModelId({ OPENAI_API_KEY: 'o', MODEL: 'gpt-4.1' })).toBe(
      'gpt-4.1',
    );
  });
});

describe('API key checks', () => {
  it('reports the key variable for the active provider', () => {
    expect(apiKeyVar({ PROVIDER: 'openai' })).toBe('OPENAI_API_KEY');
    expect(hasApiKey({ PROVIDER: 'openai', ANTHROPIC_API_KEY: 'a' })).toBe(
      false,
    );
    expect(hasApiKey({ PROVIDER: 'openai', OPENAI_API_KEY: 'o' })).toBe(true);
  });
});

describe('createModel', () => {
  it('builds a model for the active provider', () => {
    expect(createModel({ OPENAI_API_KEY: 'o' }).provider).toMatch(/^openai/);
    expect(createModel({ ANTHROPIC_API_KEY: 'a' }).provider).toMatch(
      /^anthropic/,
    );
  });
});
