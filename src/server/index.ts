import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { handleChat } from './chat.js';

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
    const value = trimmed.slice(eqIndex + 1).trim();
    // Don't overwrite existing env vars (CLI flags take precedence)
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

// API route — the only real endpoint
app.post('/api/chat', handleChat);

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
  console.log(`📁 Notes directory: ${process.env.NOTES_DIR}`);
} else {
  console.warn(
    '⚠️  NOTES_DIR is not set — set it in .env or as an environment variable',
  );
}

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`✅ Nucleus server running at http://localhost:${info.port}`);
});
