import { existsSync, readFileSync, symlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  readRegionsFile,
  readSavedRegions,
  REGIONS_FILE,
  saveRegions,
} from '../../src/main/regionsFile';
import { createFolder, createRobotProject, removeCreatedFolders } from './fixtures/robotProject';
import { sampleProject } from './fixtures/sampleProject';

afterAll(removeCreatedFolders);

describe('saveRegions', () => {
  it('round-trips a project', async () => {
    const root = createRobotProject();
    expect(await saveRegions(root, sampleProject())).toEqual({ ok: true });
    expect(await readSavedRegions(root)).toEqual({ status: 'loaded', project: sampleProject() });
  });

  it('writes readable JSON that diffs well in git', async () => {
    const root = createRobotProject();
    await saveRegions(root, sampleProject());
    const text = readFileSync(join(root, REGIONS_FILE), 'utf8');
    expect(text).toContain('\n  "version": 1');
    expect(text.endsWith('}\n')).toBe(true);
  });

  it('rejects data that fails the schema, leaving the file alone', async () => {
    const root = createRobotProject();
    await saveRegions(root, sampleProject());
    const before = readFileSync(join(root, REGIONS_FILE), 'utf8');
    const result = await saveRegions(root, { ...sampleProject(), version: 99 });
    expect(result.ok).toBe(false);
    expect(readFileSync(join(root, REGIONS_FILE), 'utf8')).toBe(before);
  });

  it.each([
    ['broken JSON', '{ broken'],
    ['a newer version', JSON.stringify({ ...sampleProject(), version: 2 })],
  ])('never overwrites a file with %s', async (_label, contents) => {
    const root = createRobotProject({ [REGIONS_FILE]: contents });
    const result = await saveRegions(root, sampleProject());
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toContain('Fix or remove it');
    expect(readFileSync(join(root, REGIONS_FILE), 'utf8')).toBe(contents);
  });

  it('keeps the recorded hash when saving', async () => {
    const root = createRobotProject();
    await saveRegions(root, sampleProject(), 'first-hash');
    await saveRegions(root, sampleProject());
    const disk = await readRegionsFile(root);
    expect(disk.status === 'loaded' && disk.generatedHash).toBe('first-hash');
  });

  it('does not follow a link out of the project', async () => {
    const outside = createFolder({});
    const root = createRobotProject();
    symlinkSync(outside, join(root, '.regionbool'));
    expect((await saveRegions(root, sampleProject())).ok).toBe(false);
    expect(existsSync(join(outside, 'regions.json'))).toBe(false);
  });
});

describe('reading', () => {
  it('reports no file', async () => {
    await expect(readSavedRegions(createRobotProject())).resolves.toEqual({ status: 'none' });
  });

  it('reports a folder in place of the file as invalid', async () => {
    const root = createRobotProject();
    mkdirSync(join(root, REGIONS_FILE), { recursive: true });
    expect((await readSavedRegions(root)).status).toBe('invalid');
  });

  it('does not send the hash to the renderer', async () => {
    const root = createRobotProject();
    await saveRegions(root, sampleProject(), 'hash');
    const saved = await readSavedRegions(root);
    expect(saved.status === 'loaded' && 'generatedHash' in saved.project).toBe(false);
  });

  it('explains what is wrong with an invalid file', async () => {
    const root = createRobotProject({ [REGIONS_FILE]: JSON.stringify({ version: 1 }) });
    const saved = await readSavedRegions(root);
    expect(saved.status === 'invalid' && saved.message).toContain('required');
  });
});
