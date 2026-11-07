/** Closing the window with unsaved changes, in the real app with no debugger attached. */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

test('the close prompt can keep the window open, or let it close', () => {
  test.setTimeout(60_000);
  const userDataDir = mkdtempSync(join(tmpdir(), 'regionbool-prompt-'));
  const electronPath = createRequire(__filename)('electron') as string;
  const result = spawnSync(
    electronPath,
    [join(__dirname, 'unsaved-prompt-main.cjs'), `--user-data-dir=${userDataDir}`],
    {
      encoding: 'utf8',
      timeout: 40_000,
    },
  );
  expect(result.stdout, result.stderr).toContain('guarded=true');
  expect(result.stdout, result.stderr).toContain('activated=true');
  expect(result.stdout, result.stderr).toContain('after-keep-editing prompts=1 open=true');
  expect(result.stdout, result.stderr).toContain('after-discard prompts=2');
});
