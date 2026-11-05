/**
 * Safe file writing inside a robot project.
 *
 * Invariants: nothing is written outside the project, even through symbolic links, writes are
 * atomic so a crash can't leave a half-written file, and generated code never replaces a file
 * without the RegionBool header.
 */
import { randomBytes, createHash } from 'node:crypto';
import { lstat, mkdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { GENERATED_HEADER } from '../shared/codegen';

/** Thrown when a path would land outside the project. */
export class PathOutsideProjectError extends Error {
  constructor(path: string) {
    super(`"${path}" is outside the project.`);
    this.name = 'PathOutsideProjectError';
  }
}

/** Returns a SHA-256 hash of text, used to notice that a file changed. */
export function hashText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Returns whether a file's first line is the RegionBool header, whatever its line endings. */
export function hasGeneratedHeader(contents: string): boolean {
  return contents.split(/\r?\n/, 1)[0] === GENERATED_HEADER;
}

function isInside(root: string, path: string): boolean {
  const fromRoot = relative(root, path);
  return (
    fromRoot !== '' &&
    !fromRoot.startsWith(`..${sep}`) &&
    fromRoot !== '..' &&
    !isAbsolute(fromRoot)
  );
}

/**
 * Resolves a project-relative path to an absolute one, and throws if it would land outside the
 * project. Links are followed for every part of the path that exists, so a folder link pointing
 * out of the project is caught. A link at the final path is refused outright.
 */
export async function resolveInProject(root: string, relativePath: string): Promise<string> {
  if (isAbsolute(relativePath)) throw new PathOutsideProjectError(relativePath);
  const realRoot = await realpath(root);
  const target = resolve(realRoot, relativePath);
  if (!isInside(realRoot, target)) throw new PathOutsideProjectError(relativePath);

  try {
    if ((await lstat(target)).isSymbolicLink()) throw new PathOutsideProjectError(relativePath);
  } catch (error) {
    if (error instanceof PathOutsideProjectError) throw error;
    // The file doesn't exist yet, which is fine.
  }

  // Find the deepest part of the path that exists, and check where it really is.
  let existing = dirname(target);
  for (;;) {
    try {
      const real = await realpath(existing);
      if (real !== realRoot && !isInside(realRoot, real)) {
        throw new PathOutsideProjectError(relativePath);
      }
      return target;
    } catch (error) {
      if (error instanceof PathOutsideProjectError) throw error;
      existing = dirname(existing);
    }
  }
}

/**
 * Writes a file inside the project atomically, by writing a temporary file beside it and renaming
 * it into place. Missing folders are created.
 */
export async function writeProjectFile(
  root: string,
  relativePath: string,
  contents: string | Uint8Array,
): Promise<void> {
  const target = await resolveInProject(root, relativePath);
  await mkdir(dirname(target), { recursive: true });
  const temp = join(dirname(target), `.regionbool-${randomBytes(6).toString('hex')}.tmp`);
  try {
    await writeFile(temp, contents, { flag: 'wx' });
    await rename(temp, target);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}
