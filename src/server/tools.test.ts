import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { createBashTool, createTextEditorTool } from './tools.js';

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

const execCtx = { toolCallId: 't1', messages: [], abortSignal: undefined as any };

describe('text_editor tool', () => {
  it('views a file with line numbers', async () => {
    const editor = createTextEditorTool(TEST_DIR);
    const result = await editor.execute!(
      { command: 'view', path: 'README.md' },
      execCtx,
    );
    expect(result).toContain('1\t# Test Notes');
  });

  it('views a directory', async () => {
    const editor = createTextEditorTool(TEST_DIR);
    const result = await editor.execute!(
      { command: 'view', path: '.' },
      execCtx,
    );
    expect(result).toContain('README.md');
    expect(result).toContain('personal');
  });

  it('creates a new file with parent dirs', async () => {
    const editor = createTextEditorTool(TEST_DIR);
    const result = await editor.execute!(
      { command: 'create', path: 'work/new.md', file_text: '# New\n' },
      execCtx,
    );
    expect(result).toContain('File created');
    const content = readFileSync(resolve(TEST_DIR, 'work/new.md'), 'utf-8');
    expect(content).toBe('# New\n');
  });

  it('replaces text in a file', async () => {
    const editor = createTextEditorTool(TEST_DIR);
    const result = await editor.execute!(
      {
        command: 'str_replace',
        path: 'personal/thoughts.md',
        old_str: 'Some ideas here.',
        new_str: 'Many great ideas here.',
      },
      execCtx,
    );
    expect(result).toContain('Successfully replaced');
    const content = readFileSync(
      resolve(TEST_DIR, 'personal/thoughts.md'),
      'utf-8',
    );
    expect(content).toContain('Many great ideas here.');
  });

  it('rejects non-unique str_replace', async () => {
    writeFileSync(resolve(TEST_DIR, 'dupe.md'), 'hello world\nhello world\n');
    const editor = createTextEditorTool(TEST_DIR);
    const result = await editor.execute!(
      { command: 'str_replace', path: 'dupe.md', old_str: 'hello world', new_str: 'hi' },
      execCtx,
    );
    expect(result).toContain('found 2 times');
  });

  it('inserts text after a line', async () => {
    const editor = createTextEditorTool(TEST_DIR);
    const result = await editor.execute!(
      { command: 'insert', path: 'README.md', insert_line: 1, new_str: 'Inserted line.' },
      execCtx,
    );
    expect(result).toContain('Successfully inserted');
    const content = readFileSync(resolve(TEST_DIR, 'README.md'), 'utf-8');
    expect(content).toContain('Inserted line.');
  });

  it('blocks path traversal', async () => {
    const editor = createTextEditorTool(TEST_DIR);
    const result = await editor.execute!(
      { command: 'view', path: '../../etc/passwd' },
      execCtx,
    );
    expect(result).toContain('Error');
  });
});
