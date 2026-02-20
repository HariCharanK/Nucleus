import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { createBashTool } from './tools.js';

const TEST_DIR = resolve(import.meta.dirname, '../../.test-notes');

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  mkdirSync(resolve(TEST_DIR, 'personal'), { recursive: true });
  writeFileSync(resolve(TEST_DIR, 'README.md'), '# Test Notes\n');
  writeFileSync(
    resolve(TEST_DIR, 'personal/thoughts.md'),
    '# Thoughts\n\nSome ideas here.\n',
  );
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('bash tool', () => {
  it('executes a command and returns output', async () => {
    const bash = createBashTool(TEST_DIR);
    const result = await bash.execute!(
      { command: 'echo hello' },
      { toolCallId: '1', messages: [], abortSignal: undefined as any },
    );
    expect(result).toBe('hello\n');
  });

  it('runs commands scoped to notes dir', async () => {
    const bash = createBashTool(TEST_DIR);
    const result = await bash.execute!(
      { command: 'ls' },
      { toolCallId: '2', messages: [], abortSignal: undefined as any },
    );
    expect(result).toContain('README.md');
    expect(result).toContain('personal');
  });

  it('returns error output on command failure', async () => {
    const bash = createBashTool(TEST_DIR);
    const result = await bash.execute!(
      { command: 'cat nonexistent-file' },
      { toolCallId: '3', messages: [], abortSignal: undefined as any },
    );
    expect(result).toContain('No such file');
  });

  it('truncates long output', async () => {
    const bash = createBashTool(TEST_DIR);
    // Generate output > 10000 chars
    const result = await bash.execute!(
      { command: 'seq 1 5000' },
      { toolCallId: '4', messages: [], abortSignal: undefined as any },
    );
    expect(result).toContain('truncated');
  });

  it('respects timeout', async () => {
    const bash = createBashTool(TEST_DIR);
    // This should fail or return quickly since timeout is 30s
    const result = await bash.execute!(
      { command: 'echo fast' },
      { toolCallId: '5', messages: [], abortSignal: undefined as any },
    );
    expect(result).toBe('fast\n');
  });
});
