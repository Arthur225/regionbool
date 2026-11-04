import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // Electron instances share app-level state, so run them one at a time.
  workers: 1,
  reporter: 'list',
  use: { trace: 'retain-on-failure' },
});
