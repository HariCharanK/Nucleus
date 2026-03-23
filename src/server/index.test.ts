import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'fs';
import { resolve } from 'path';
import {
  createSession,
  listSessions,
  getSession,
  updateSession,
  deleteSession,
  addMessage,
  getMessages,
  replaceMessages,
  titleFromMessage,
  resetDb,
} from './db.js';

const TEST_DIR = resolve(import.meta.dirname, '../../.test-notes-server');

beforeEach(() => {
  mkdirSync(resolve(TEST_DIR, '.nucleus'), { recursive: true });
});

afterEach(() => {
  resetDb();
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('Session CRUD', () => {
  it('creates a session with default title', async () => {
    const session = await createSession(TEST_DIR);
    expect(session.id).toBeTruthy();
    expect(session.title).toBe('Untitled');
    expect(session.created_at).toBeTruthy();
  });

  it('creates a session with custom title', async () => {
    const session = await createSession(TEST_DIR, 'My Notes');
    expect(session.title).toBe('My Notes');
  });

  it('lists all sessions', async () => {
    await createSession(TEST_DIR, 'First');
    await createSession(TEST_DIR, 'Second');
    const sessions = await listSessions(TEST_DIR);
    expect(sessions).toHaveLength(2);
    const titles = sessions.map((s) => s.title);
    expect(titles).toContain('First');
    expect(titles).toContain('Second');
  });

  it('gets a session by ID', async () => {
    const created = await createSession(TEST_DIR, 'Test');
    const found = await getSession(TEST_DIR, created.id);
    expect(found).not.toBeNull();
    expect(found!.title).toBe('Test');
  });

  it('returns null for nonexistent session', async () => {
    const found = await getSession(TEST_DIR, 'nonexistent');
    expect(found).toBeNull();
  });

  it('updates session title', async () => {
    const session = await createSession(TEST_DIR);
    await updateSession(TEST_DIR, session.id, { title: 'Renamed' });
    const found = await getSession(TEST_DIR, session.id);
    expect(found!.title).toBe('Renamed');
  });

  it('deletes a session', async () => {
    const session = await createSession(TEST_DIR, 'Doomed');
    await addMessage(TEST_DIR, session.id, { role: 'user', content: 'hello' });
    await deleteSession(TEST_DIR, session.id);
    expect(await getSession(TEST_DIR, session.id)).toBeNull();
  });
});

describe('Messages', () => {
  it('adds and retrieves messages in order', async () => {
    const session = await createSession(TEST_DIR);
    await addMessage(TEST_DIR, session.id, { role: 'user', content: 'hello' });
    await addMessage(TEST_DIR, session.id, {
      role: 'assistant',
      content: 'hi there',
    });
    const msgs = await getMessages(TEST_DIR, session.id);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('user');
    expect(msgs[0].content).toBe('hello');
    expect(msgs[1].role).toBe('assistant');
    expect(msgs[1].content).toBe('hi there');
  });

  it('stores full message object as JSON in data column', async () => {
    const session = await createSession(TEST_DIR);
    const fullMessage = {
      id: 'msg-123',
      role: 'assistant',
      content: 'I ran a command',
      parts: [
        { type: 'text', text: 'I ran a command' },
        {
          type: 'tool-invocation',
          toolInvocation: {
            toolCallId: 'tc-1',
            toolName: 'bash',
            args: { command: 'ls -la' },
            state: 'result',
            result: 'file1.md\nfile2.md\n',
          },
        },
      ],
      createdAt: '2024-01-01T00:00:00Z',
    };
    await addMessage(TEST_DIR, session.id, fullMessage);

    const msgs = await getMessages(TEST_DIR, session.id);
    expect(msgs).toHaveLength(1);

    // Verify full object is preserved
    const restored = JSON.parse(msgs[0].data);
    expect(restored.id).toBe('msg-123');
    expect(restored.parts).toHaveLength(2);
    expect(restored.parts[1].toolInvocation.result).toBe(
      'file1.md\nfile2.md\n',
    );
    expect(restored.createdAt).toBe('2024-01-01T00:00:00Z');

    // Denormalized columns also work for querying
    expect(msgs[0].role).toBe('assistant');
    expect(msgs[0].content).toBe('I ran a command');
  });

  it('preserves reasoning parts', async () => {
    const session = await createSession(TEST_DIR);
    const message = {
      role: 'assistant',
      content: 'answer',
      parts: [
        { type: 'reasoning', reasoning: 'Let me think about this...' },
        { type: 'text', text: 'answer' },
      ],
    };
    await addMessage(TEST_DIR, session.id, message);

    const msgs = await getMessages(TEST_DIR, session.id);
    const restored = JSON.parse(msgs[0].data);
    expect(restored.parts[0].type).toBe('reasoning');
    expect(restored.parts[0].reasoning).toBe('Let me think about this...');
  });

  it('replaces all messages for a session', async () => {
    const session = await createSession(TEST_DIR);
    await addMessage(TEST_DIR, session.id, { role: 'user', content: 'old' });

    await replaceMessages(TEST_DIR, session.id, [
      { role: 'user', content: 'new message 1' },
      { role: 'assistant', content: 'new response' },
    ]);

    const msgs = await getMessages(TEST_DIR, session.id);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].content).toBe('new message 1');
    expect(msgs[1].content).toBe('new response');
  });
});

describe('titleFromMessage', () => {
  it('returns short messages as-is', () => {
    expect(titleFromMessage('Hello world')).toBe('Hello world');
  });

  it('truncates long messages', () => {
    const long = 'A'.repeat(100);
    const title = titleFromMessage(long);
    expect(title.length).toBeLessThanOrEqual(50);
    expect(title).toContain('…');
  });

  it('cleans up whitespace', () => {
    expect(titleFromMessage('  hello\n  world  ')).toBe('hello world');
  });
});
