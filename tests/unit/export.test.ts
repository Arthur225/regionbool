import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { previewExport, writeExport } from '../../src/main/export';
import { GENERATED_HEADER, generateJava } from '../../src/shared/codegen';
import { JAVA_PROFILES } from '../../src/shared/javaProfiles';
import { createRobotProject, removeCreatedFolders } from './fixtures/robotProject';
import { sampleProject } from './fixtures/sampleProject';

afterAll(removeCreatedFolders);

const TARGET = 'src/main/java/frc/robot/generated/FieldRegions.java';
const generated = generateJava(sampleProject(), JAVA_PROFILES.legacy);

describe('previewExport', () => {
  it('reports a new file, and writes nothing', async () => {
    const root = createRobotProject();
    const preview = await previewExport(root, sampleProject(), 'legacy');
    expect(preview).toMatchObject({
      ok: true,
      relativePath: TARGET,
      status: 'new',
      existing: null,
      existingHash: null,
      generated,
    });
    expect(existsSync(join(root, TARGET))).toBe(false);
  });

  it('tells apart unchanged, updated and foreign files', async () => {
    const status = async (contents: string) => {
      const preview = await previewExport(
        createRobotProject({ [TARGET]: contents }),
        sampleProject(),
        'legacy',
      );
      return preview.ok && preview.status;
    };
    await expect(status(generated)).resolves.toBe('unchanged');
    await expect(status(`${GENERATED_HEADER}\nold`)).resolves.toBe('update');
    await expect(status('public class FieldRegions {}')).resolves.toBe('not-generated');
  });

  it.each<[string, unknown, unknown]>([
    ['a non-object', 'nope', 'legacy'],
    ['extra properties', { ...sampleProject(), extra: 1 }, 'legacy'],
    ['an unknown profile', sampleProject(), 'future'],
    ['an inherited profile name', sampleProject(), 'constructor'],
  ])('rejects %s', async (_label, data, profile) => {
    const preview = await previewExport(createRobotProject(), data, profile);
    expect(preview.ok).toBe(false);
  });

  it('reports semantic problems with details', async () => {
    const project = sampleProject();
    project.regions[0]!.name = '---';
    const preview = await previewExport(createRobotProject(), project, 'legacy');
    expect(!preview.ok && preview.issues[0]?.regionId).toBe('r1');
  });

  it('cannot be aimed outside the project through output names', async () => {
    const project = sampleProject();
    project.output = { packageName: '..', className: 'evil' };
    expect((await previewExport(createRobotProject(), project, 'legacy')).ok).toBe(false);
    project.output = { packageName: 'frc', className: '../../evil' };
    expect((await previewExport(createRobotProject(), project, 'legacy')).ok).toBe(false);
  });
});

describe('writeExport', () => {
  it('writes a new file', async () => {
    const root = createRobotProject();
    const result = await writeExport(root, sampleProject(), 'legacy', null);
    expect(result).toMatchObject({ ok: true, relativePath: TARGET });
    expect(readFileSync(join(root, TARGET), 'utf8')).toBe(generated);
  });

  it('updates a generated file when it matches the preview', async () => {
    const root = createRobotProject({ [TARGET]: `${GENERATED_HEADER}\nold` });
    const preview = await previewExport(root, sampleProject(), 'legacy');
    const result = await writeExport(
      root,
      sampleProject(),
      'legacy',
      preview.ok ? preview.existingHash : '',
    );
    expect(result.ok).toBe(true);
    expect(readFileSync(join(root, TARGET), 'utf8')).toBe(generated);
  });

  it('refuses to replace a hand-written file, whatever hash is given', async () => {
    const handWritten = 'public class FieldRegions { /* mine */ }';
    const root = createRobotProject({ [TARGET]: handWritten });
    const preview = await previewExport(root, sampleProject(), 'legacy');
    const result = await writeExport(
      root,
      sampleProject(),
      'legacy',
      preview.ok ? preview.existingHash : '',
    );
    expect(result.ok).toBe(false);
    expect(readFileSync(join(root, TARGET), 'utf8')).toBe(handWritten);
  });

  it('refuses if the file changed after the preview', async () => {
    const root = createRobotProject({ [TARGET]: `${GENERATED_HEADER}\nold` });
    const preview = await previewExport(root, sampleProject(), 'legacy');
    const edited = `${GENERATED_HEADER}\nedited meanwhile`;
    writeFileSync(join(root, TARGET), edited);
    const result = await writeExport(
      root,
      sampleProject(),
      'legacy',
      preview.ok ? preview.existingHash : '',
    );
    expect(result.ok).toBe(false);
    expect(readFileSync(join(root, TARGET), 'utf8')).toBe(edited);
  });

  it('refuses if a file appeared after a preview that saw none', async () => {
    const made = `${GENERATED_HEADER}\nappeared`;
    const withFile = createRobotProject({ [TARGET]: made });
    expect((await writeExport(withFile, sampleProject(), 'legacy', null)).ok).toBe(false);
    expect(readFileSync(join(withFile, TARGET), 'utf8')).toBe(made);
  });
});
