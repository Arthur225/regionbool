import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readSettings, writeSettings } from '../../src/main/settings';
import { createFolder, removeCreatedFolders } from './fixtures/robotProject';

afterAll(removeCreatedFolders);

describe('app settings', () => {
  it('round-trips, and leaves no temporary files', async () => {
    const dir = createFolder({});
    await writeSettings(dir, { lastProjectPath: '/robots/mine' });
    await expect(readSettings(dir)).resolves.toEqual({ lastProjectPath: '/robots/mine' });
    expect(readdirSync(dir)).toEqual(['settings.json']);
  });

  it('creates its folder if needed', async () => {
    const dir = join(createFolder({}), 'new', 'folder');
    await writeSettings(dir, { lastProjectPath: null });
    expect(existsSync(join(dir, 'settings.json'))).toBe(true);
  });

  it('uses defaults when there is no file', async () => {
    await expect(readSettings(createFolder({}))).resolves.toEqual({ lastProjectPath: null });
  });

  it.each([
    ['broken JSON', '{ broken'],
    ['null', 'null'],
    ['a wrong type', '{"lastProjectPath": 5}'],
    ['an empty path', '{"lastProjectPath": ""}'],
  ])('uses defaults for %s', async (_label, contents) => {
    const dir = createFolder({ 'settings.json': contents });
    await expect(readSettings(dir)).resolves.toEqual({ lastProjectPath: null });
    writeFileSync(join(dir, 'settings.json'), contents);
  });
});
