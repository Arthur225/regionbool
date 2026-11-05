import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { GENERATED_HEADER } from '../../src/shared/codegen';
import {
  hasGeneratedHeader,
  PathOutsideProjectError,
  resolveInProject,
  writeProjectFile,
} from '../../src/main/writer';
import { createFolder, removeCreatedFolders } from './fixtures/robotProject';

afterAll(removeCreatedFolders);

describe('resolveInProject', () => {
  it('accepts paths inside the project, including ones that do not exist yet', async () => {
    const root = createFolder({ 'a.txt': '' });
    await expect(resolveInProject(root, 'a.txt')).resolves.toContain('a.txt');
    await expect(resolveInProject(root, 'new/deep/b.txt')).resolves.toContain('b.txt');
    await expect(resolveInProject(root, 'dir/../a.txt')).resolves.toContain('a.txt');
  });

  it.each(['../evil.txt', 'a/../../evil.txt', '/etc/evil.txt', '.', ''])(
    'rejects "%s"',
    async (path) => {
      const root = createFolder({});
      await expect(resolveInProject(root, path)).rejects.toThrow(PathOutsideProjectError);
    },
  );

  it('accepts a sibling name that merely starts with dots', async () => {
    const root = createFolder({});
    await expect(resolveInProject(root, '..hidden/file.txt')).resolves.toContain('..hidden');
  });

  it('rejects a folder link that leads out of the project', async () => {
    const outside = createFolder({});
    const root = createFolder({});
    symlinkSync(outside, join(root, 'link'));
    await expect(resolveInProject(root, 'link/evil.txt')).rejects.toThrow(PathOutsideProjectError);
    await expect(resolveInProject(root, 'link/new/evil.txt')).rejects.toThrow(
      PathOutsideProjectError,
    );
  });

  it('rejects a link at the file itself', async () => {
    const outside = createFolder({ 'target.txt': 'original' });
    const root = createFolder({});
    symlinkSync(join(outside, 'target.txt'), join(root, 'file.txt'));
    await expect(resolveInProject(root, 'file.txt')).rejects.toThrow(PathOutsideProjectError);
  });

  it('accepts a link that stays inside the project, and a project opened through a link', async () => {
    const root = createFolder({ 'real/a.txt': '' });
    symlinkSync(join(root, 'real'), join(root, 'inner'));
    await expect(resolveInProject(root, 'inner/new.txt')).resolves.toContain('new.txt');

    const holder = createFolder({});
    symlinkSync(root, join(holder, 'linked'));
    await expect(resolveInProject(join(holder, 'linked'), 'b.txt')).resolves.toContain('b.txt');
  });
});

describe('writeProjectFile', () => {
  it('creates folders, writes the file and leaves no temporary files', async () => {
    const root = createFolder({});
    await writeProjectFile(root, 'src/deep/a.txt', 'hello');
    expect(readFileSync(join(root, 'src/deep/a.txt'), 'utf8')).toBe('hello');
    expect(readdirSync(join(root, 'src/deep'))).toEqual(['a.txt']);
  });

  it('replaces an existing file', async () => {
    const root = createFolder({ 'a.txt': 'old' });
    await writeProjectFile(root, 'a.txt', 'new');
    expect(readFileSync(join(root, 'a.txt'), 'utf8')).toBe('new');
  });

  it('writes nothing outside the project', async () => {
    const outside = createFolder({});
    const root = createFolder({});
    symlinkSync(outside, join(root, 'link'));
    await expect(writeProjectFile(root, 'link/evil.txt', 'x')).rejects.toThrow();
    expect(existsSync(join(outside, 'evil.txt'))).toBe(false);
  });

  it('cleans up its temporary file when the write fails', async () => {
    const root = createFolder({});
    mkdirSync(join(root, 'target'));
    writeFileSync(join(root, 'target/keep.txt'), '');
    await expect(writeProjectFile(root, 'target', 'x')).rejects.toThrow();
    expect(readdirSync(root)).toEqual(['target']);
  });
});

describe('hasGeneratedHeader', () => {
  it('needs the header on the first line, with any line ending', () => {
    expect(hasGeneratedHeader(`${GENERATED_HEADER}\ncode`)).toBe(true);
    expect(hasGeneratedHeader(`${GENERATED_HEADER}\r\ncode`)).toBe(true);
    expect(hasGeneratedHeader(`code\n${GENERATED_HEADER}`)).toBe(false);
    expect(hasGeneratedHeader(`${GENERATED_HEADER} but edited\n`)).toBe(false);
    expect(hasGeneratedHeader('')).toBe(false);
  });
});
