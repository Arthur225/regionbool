import { defineConfig } from '@playwright/test';

/** Tests the packaged app in `release/`. Run with `npm run test:packaged`. */
export default defineConfig({
  testDir: './tests/packaged',
  workers: 1,
  reporter: 'list',
  use: { trace: 'retain-on-failure' },
});
