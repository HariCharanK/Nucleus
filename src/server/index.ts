import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { handleChat } from './chat.js';
import { getPreviousConversation } from './prompts.js';

// ---------------------------------------------------------------------------
// Load .env file (simple built-in loader — no external dependencies)
// ---------------------------------------------------------------------------
try {
  const envFile = readFileSync(resolve(process.cwd(), '.env'), 'utf-8');
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    // Strip surrounding quotes (single or double)
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
} catch {
  // No .env file — that's fine, env vars may be set externally
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
const app = new Hono();

// Health check
app.get('/api/health', (c) => {
  return c.json({
    ok: true,
    notesDir: process.env.NOTES_DIR || null,
    hasApiKey: !!process.env.ANTHROPIC_API_KEY,
    model: process.env.MODEL || 'claude-opus-4-6',
  });
});

// Chat endpoint — the core agentic loop
app.post('/api/chat', handleChat);

// Session endpoint — check if there's a previous conversation to restore
app.get('/api/session', (c) => {
  const notesDir = process.env.NOTES_DIR;
  if (!notesDir) return c.json({ hasPreviousConversation: false });

  const transcript = getPreviousConversation(notesDir);
  return c.json({
    hasPreviousConversation: !!transcript,
    transcript: transcript || null,
  });
});

// New chat — clears the conversation file, optionally archives it
app.post('/api/new-chat', (c) => {
  const notesDir = process.env.NOTES_DIR;
  if (!notesDir) return c.json({ ok: true });

  const nucleusDir = resolve(notesDir, '.nucleus');
  const convPath = resolve(nucleusDir, 'current-conversation.md');

  try {
    // Archive previous conversation if it exists
    const prev = getPreviousConversation(notesDir);
    if (prev) {
      const archiveDir = resolve(nucleusDir, 'conversations');
      mkdirSync(archiveDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      writeFileSync(resolve(archiveDir, `${timestamp}.md`), prev, 'utf-8');
    }

    // Clear current conversation
    mkdirSync(nucleusDir, { recursive: true });
    writeFileSync(convPath, '', 'utf-8');
    return c.json({ ok: true });
  } catch {
    return c.json({ ok: false, error: 'Failed to clear conversation' }, 500);
  }
});

// Diff endpoint — returns uncommitted git changes from the notes dir
app.get('/api/diff', (c) => {
  const notesDir = process.env.NOTES_DIR;
  if (!notesDir) return c.json({ diff: '', stat: '' });

  try {
    const diff = execSync('git diff', {
      cwd: notesDir,
      encoding: 'utf-8',
      timeout: 5000,
    });
    const stat = execSync('git diff --stat', {
      cwd: notesDir,
      encoding: 'utf-8',
      timeout: 5000,
    });
    // Also include untracked files
    const untracked = execSync('git ls-files --others --exclude-standard', {
      cwd: notesDir,
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();

    // For untracked files, generate a diff-like output
    let fullDiff = diff;
    if (untracked) {
      for (const file of untracked.split('\n')) {
        if (!file) continue;
        try {
          const content = readFileSync(resolve(notesDir, file), 'utf-8');
          fullDiff += `\ndiff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${content.split('\n').length} @@\n`;
          fullDiff += content
            .split('\n')
            .map((l) => `+${l}`)
            .join('\n');
          fullDiff += '\n';
        } catch {
          // Skip files we can't read
        }
      }
    }

    return c.json({ diff: fullDiff, stat, untracked });
  } catch {
    return c.json({ diff: '', stat: '' });
  }
});

// In production, serve the Vite-built static files
if (process.env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: './dist' }));

  // SPA fallback — serve index.html for client-side routes
  app.get('*', async (c) => {
    try {
      const html = readFileSync(resolve('dist', 'index.html'), 'utf-8');
      return c.html(html);
    } catch {
      return c.text('Not Found', 404);
    }
  });
}

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
const port = parseInt(process.env.PORT || '3001', 10);

console.log(`🧠 Nucleus server starting on port ${port}`);
if (process.env.NOTES_DIR) {
  const notesDir = process.env.NOTES_DIR;
  console.log(`📁 Notes directory: ${notesDir}`);

  // Ensure .nucleus/conversations/ is gitignored in the target repo
  const gitignorePath = resolve(notesDir, '.gitignore');
  const ignoreEntry = '.nucleus/conversations/';
  try {
    const existing = existsSync(gitignorePath)
      ? readFileSync(gitignorePath, 'utf-8')
      : '';
    if (!existing.split('\n').some((l) => l.trim() === ignoreEntry)) {
      const separator = existing && !existing.endsWith('\n') ? '\n' : '';
      writeFileSync(gitignorePath, existing + separator + ignoreEntry + '\n', 'utf-8');
      console.log(`📝 Added ${ignoreEntry} to target repo .gitignore`);
    }
  } catch {
    // Non-critical
  }
} else {
  console.warn(
    '⚠️  NOTES_DIR is not set — set it in .env or as an environment variable',
  );
}

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`✅ Nucleus server running at http://localhost:${info.port}`);
});
