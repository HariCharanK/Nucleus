import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5200';
const API = 'http://localhost:3001';

test.describe('Session persistence', () => {
  test('sidebar loads and shows existing sessions', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForTimeout(1500);

    // Sidebar should be visible with branding and new chat button
    await expect(page.locator('h1:has-text("Nucleus")')).toBeVisible();
    await expect(page.getByRole('button', { name: 'New Chat' })).toBeVisible();

    // Should show the session we created via API earlier
    await expect(page.locator('text=List my files')).toBeVisible();
  });

  test('clicking a session loads messages with tool calls', async ({
    page,
  }) => {
    await page.goto(BASE);
    await page.waitForTimeout(1500);

    // Click the session in the sidebar
    await page.locator('aside >> text=List my files').click();
    await page.waitForTimeout(1000);

    // User message should appear
    await expect(page.locator('main >> text=List my files')).toBeVisible();

    // Assistant tool calls should render
    await expect(page.locator('text=ls -la')).toBeVisible();
    await expect(page.locator('text=view README.md')).toBeVisible();

    // Assistant text should appear
    await expect(page.locator('text=Here are your files')).toBeVisible();
  });

  test('new chat clears messages', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForTimeout(1500);

    // Load a session first
    await page.locator('aside >> text=List my files').click();
    await page.waitForTimeout(1000);
    await expect(page.locator('text=Here are your files')).toBeVisible();

    // Click New Chat
    await page.getByRole('button', { name: 'New Chat' }).click();
    await page.waitForTimeout(500);

    // Empty state should show
    await expect(
      page.locator('text=Start a conversation with Nucleus'),
    ).toBeVisible();
  });

  test('textarea is always enabled', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForTimeout(500);

    const textarea = page.locator('textarea');
    await expect(textarea).toBeEnabled();
    await textarea.fill('test message');
    await expect(textarea).toHaveValue('test message');
  });

  test('full data roundtrip preserves tool invocations', async ({ page }) => {
    // Verify via API that stored data has full tool call results
    const res = await page.request.get(`${API}/api/sessions`);
    const data = await res.json();
    const session = data.sessions.find(
      (s: { title: string }) => s.title === 'List my files',
    );
    expect(session).toBeTruthy();

    const sessionRes = await page.request.get(
      `${API}/api/sessions/${session.id}`,
    );
    const sessionData = await sessionRes.json();

    const assistantMsg = sessionData.messages.find(
      (m: { role: string }) => m.role === 'assistant',
    );
    expect(assistantMsg).toBeTruthy();

    // Message ID preserved
    expect(assistantMsg.id).toBe('msg-002');

    // All 5 parts preserved (step-start, tool, text, tool, text)
    expect(assistantMsg.parts).toHaveLength(5);

    // Timestamp preserved
    expect(assistantMsg.createdAt).toBe('2026-03-23T10:00:01Z');

    // Tool invocation results preserved
    const toolParts = assistantMsg.parts.filter(
      (p: { type: string }) => p.type === 'tool-invocation',
    );
    expect(toolParts).toHaveLength(2);
    expect(toolParts[0].toolInvocation.toolName).toBe('bash');
    expect(toolParts[0].toolInvocation.result).toContain('README.md');
    expect(toolParts[1].toolInvocation.toolName).toBe('text_editor');
    expect(toolParts[1].toolInvocation.result).toContain('# Test Notes');

    // Legacy toolInvocations array also preserved
    expect(assistantMsg.toolInvocations).toHaveLength(2);
  });
});
