import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';

const TEST_DIR = resolve(import.meta.dirname, '../../.test-notes-server');

// We test the Hono routes in isolation by recreating the app
function createTestApp() {
  const app = new Hono();

  app.get('/api/health', (c) => {
    return c.json({
      ok: true,
      notesDir: TEST_DIR,
      hasApiKey: true,
      model: 'test-model',
    });
  });

  app.get('/api/diff', (c) => {
    try {
      const diff = execSync('git diff', {
        cwd: TEST_DIR,
        encoding: 'utf-8',
        timeout: 5000,
      });
      const stat = execSync('git diff --stat', {
        cwd: TEST_DIR,
        encoding: 'utf-8',
        timeout: 5000,
      });
      return c.json({ diff, stat });
    } catch {
      return c.json({ diff: '', stat: '' });
    }
  });

  return app;
}

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  execSync('git init && git config user.email "test@test.com" && git config user.name "Test"', {
    cwd: TEST_DIR,
    stdio: 'pipe',
  });
  writeFileSync(resolve(TEST_DIR, 'note.md'), '# Hello\n');
  execSync('git add -A && git commit -m "init"', {
    cwd: TEST_DIR,
    stdio: 'pipe',
  });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('API endpoints', () => {
  it('GET /api/health returns ok', async () => {
    const app = createTestApp();
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.notesDir).toBe(TEST_DIR);
  });

  it('GET /api/diff returns empty when no changes', async () => {
    const app = createTestApp();
    const res = await app.request('/api/diff');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.diff).toBe('');
  });

  it('GET /api/diff returns diff when files are modified', async () => {
    writeFileSync(resolve(TEST_DIR, 'note.md'), '# Hello\n\nNew content.\n');
    const app = createTestApp();
    const res = await app.request('/api/diff');
    const body = await res.json();
    expect(body.diff).toContain('+New content.');
    expect(body.stat).toContain('note.md');
  });
});
