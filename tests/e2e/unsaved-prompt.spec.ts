/** Closing the window with unsaved changes, in the real app with no debugger attached. */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

test('the close prompt can keep the window open, or let it close', () => {
  const electronPath = createRequire(__filename)('electron') as string;
  const result = spawnSync(electronPath, [join(__dirname, 'unsaved-prompt-main.cjs')], {
    encoding: 'utf8',
    timeout: 20_000,
  });
  expect(result.stdout, result.stderr).toContain('after-keep-editing prompts=1 open=true');
  expect(result.stdout, result.stderr).toContain('after-discard prompts=2');
});
