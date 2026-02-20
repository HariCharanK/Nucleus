import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { resolve } from 'path';
import { buildSystemPrompt } from './prompts.js';

const TEST_DIR = resolve(import.meta.dirname, '../../.test-notes-prompts');

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  // Init a git repo so find works properly
  const { execSync } = require('child_process');
  execSync('git init', { cwd: TEST_DIR, stdio: 'pipe' });
  mkdirSync(resolve(TEST_DIR, 'personal'), { recursive: true });
  writeFileSync(resolve(TEST_DIR, 'README.md'), '# Notes\n');
  writeFileSync(resolve(TEST_DIR, 'personal/ideas.md'), '# Ideas\n');
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('buildSystemPrompt', () => {
  it('includes the directory structure', async () => {
    const prompt = await buildSystemPrompt(TEST_DIR);
    expect(prompt).toContain('README.md');
    expect(prompt).toContain('personal');
    expect(prompt).toContain('ideas.md');
  });

  it('includes the Nucleus identity', async () => {
    const prompt = await buildSystemPrompt(TEST_DIR);
    expect(prompt).toContain('Nucleus');
    expect(prompt).toContain('thought-routing agent');
  });

  it('includes git workflow instructions', async () => {
    const prompt = await buildSystemPrompt(TEST_DIR);
    expect(prompt).toContain('git add -A');
    expect(prompt).toContain('git commit');
    expect(prompt).toContain('do NOT run `git diff`');
  });

  it('includes memory when .nucleus/memory.md exists', async () => {
    mkdirSync(resolve(TEST_DIR, '.nucleus'), { recursive: true });
    writeFileSync(
      resolve(TEST_DIR, '.nucleus/memory.md'),
      'User prefers flat directory structures.\n',
    );
    const prompt = await buildSystemPrompt(TEST_DIR);
    expect(prompt).toContain('Your Memory');
    expect(prompt).toContain('flat directory structures');
  });

  it('works without .nucleus/memory.md', async () => {
    const prompt = await buildSystemPrompt(TEST_DIR);
    expect(prompt).not.toContain('Your Memory');
    // Should still have the core prompt
    expect(prompt).toContain('Nucleus');
  });

  it('includes today\'s date', async () => {
    const prompt = await buildSystemPrompt(TEST_DIR);
    const today = new Date().toISOString().split('T')[0];
    expect(prompt).toContain(today);
  });
});
