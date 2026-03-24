import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { handleChat } from './chat.js';
import {
  listSessions,
  getSession,
  createSession,
  updateSession,
  deleteSession,
  getMessages,
  replaceMessages,
  titleFromMessage,
} from './db.js';

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
  // No .env file — env vars may be set externally
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

// ---------------------------------------------------------------------------
// Session endpoints
// ---------------------------------------------------------------------------

/** List all sessions (most recent first). */
app.get('/api/sessions', async (c) => {
  const notesDir = process.env.NOTES_DIR;
  if (!notesDir) return c.json({ sessions: [] });
  const sessions = await listSessions(notesDir);
  return c.json({ sessions });
});

/** Create a new session. */
app.post('/api/sessions', async (c) => {
  const notesDir = process.env.NOTES_DIR;
  if (!notesDir) return c.json({ error: 'NOTES_DIR not set' }, 500);
  const body = await c.req.json().catch(() => ({}));
  const session = await createSession(notesDir, body.title);
  return c.json(session, 201);
});

/** Get a session with its messages. */
app.get('/api/sessions/:id', async (c) => {
  const notesDir = process.env.NOTES_DIR;
  if (!notesDir) return c.json({ error: 'NOTES_DIR not set' }, 500);
  const session = await getSession(notesDir, c.req.param('id'));
  if (!session) return c.json({ error: 'Session not found' }, 404);
  const messageRows = await getMessages(notesDir, session.id);
  const messages = messageRows.map((m) => JSON.parse(m.data));
  return c.json({ ...session, messages });
});

/** Update a session (title, messages). */
app.put('/api/sessions/:id', async (c) => {
  const notesDir = process.env.NOTES_DIR;
  if (!notesDir) return c.json({ error: 'NOTES_DIR not set' }, 500);
  const id = c.req.param('id');
  const session = await getSession(notesDir, id);
  if (!session) return c.json({ error: 'Session not found' }, 404);

  const body = await c.req.json();

  if (body.title !== undefined) {
    await updateSession(notesDir, id, { title: body.title });
  }

  if (body.messages && Array.isArray(body.messages)) {
    await replaceMessages(notesDir, id, body.messages);

    // Auto-title from first user message if still "Untitled"
    if (session.title === 'Untitled') {
      const firstUserMsg = body.messages.find(
        (m: { role: string }) => m.role === 'user',
      );
      if (firstUserMsg?.content) {
        await updateSession(notesDir, id, {
          title: titleFromMessage(firstUserMsg.content),
        });
      }
    }
  }

  return c.json({ ok: true });
});

/** Delete a session. */
app.delete('/api/sessions/:id', async (c) => {
  const notesDir = process.env.NOTES_DIR;
  if (!notesDir) return c.json({ error: 'NOTES_DIR not set' }, 500);
  await deleteSession(notesDir, c.req.param('id'));
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Chat endpoint — the core agentic loop
// ---------------------------------------------------------------------------
app.post('/api/chat', handleChat);

// ---------------------------------------------------------------------------
// Diff endpoint — returns uncommitted git changes from the notes dir
// ---------------------------------------------------------------------------
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
    const untracked = execSync('git ls-files --others --exclude-standard', {
      cwd: notesDir,
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();

    let fullDiff = diff;
    if (untracked) {
      for (const file of untracked.split('\n')) {
        if (!file || file.startsWith('.nucleus/')) continue;
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

    // Strip .nucleus/ paths from diff — internal files, not user content
    const filteredDiff = fullDiff
      .split(/(?=^diff --git )/m)
      .filter((chunk) => !chunk.includes('a/.nucleus/') && !chunk.includes('b/.nucleus/'))
      .join('');
    const filteredStat = stat
      .split('\n')
      .filter((line) => !line.includes('.nucleus/'))
      .join('\n');

    return c.json({ diff: filteredDiff, stat: filteredStat, untracked });
  } catch {
    return c.json({ diff: '', stat: '' });
  }
});

// ---------------------------------------------------------------------------
// Static files (production)
// ---------------------------------------------------------------------------
if (process.env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: './dist' }));

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

  // Ensure .nucleus/ directory exists and is gitignored
  mkdirSync(resolve(notesDir, '.nucleus'), { recursive: true });

  const gitignorePath = resolve(notesDir, '.gitignore');
  const ignoreEntries = ['.nucleus/conversations/'];
  try {
    const existing = existsSync(gitignorePath)
      ? readFileSync(gitignorePath, 'utf-8')
      : '';
    const lines = existing.split('\n').map((l) => l.trim());
    const missing = ignoreEntries.filter((e) => !lines.includes(e));
    if (missing.length > 0) {
      const separator = existing && !existing.endsWith('\n') ? '\n' : '';
      writeFileSync(
        gitignorePath,
        existing + separator + missing.join('\n') + '\n',
        'utf-8',
      );
      console.log(`📝 Added ${missing.join(', ')} to .gitignore`);
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
