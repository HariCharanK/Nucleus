import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 15000,
  use: {
    headless: true,
    baseURL: 'http://localhost:5199',
  },
});
