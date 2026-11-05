/**
 * Reads and writes `.regionbool/regions.json`. Teams commit this file, so it may be edited by hand
 * or come from a merge. A file that can't be understood is never overwritten, since that would
 * destroy someone's work: the user has to fix or remove it.
 */
import { readFile } from 'node:fs/promises';
import { Ajv } from 'ajv';
import schema from '../../schemas/regions.schema.json';
import type { SavedRegions, SaveResult } from '../shared/ipc';
import type { RegionProject } from '../shared/model';
import { resolveInProject, writeProjectFile } from './writer';

/** Where region data lives, relative to the project root. */
export const REGIONS_FILE = '.regionbool/regions.json';

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile<RegionProject>(schema);

/** Checks unknown data against the file schema. Returns a message describing any problems. */
export function checkRegionData(
  data: unknown,
): { ok: true; project: RegionProject } | { ok: false; message: string } {
  if (validate(data)) return { ok: true, project: data };
  return { ok: false, message: ajv.errorsText(validate.errors, { dataVar: 'file' }) };
}

type DiskRegions =
  | { status: 'none' }
  | { status: 'loaded'; project: RegionProject; generatedHash: string | null }
  | { status: 'invalid'; message: string };

/** Reads the file, keeping the hash separate from the data the editor works with. */
export async function readRegionsFile(root: string): Promise<DiskRegions> {
  let text: string;
  try {
    text = await readFile(await resolveInProject(root, REGIONS_FILE), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { status: 'none' };
    return { status: 'invalid', message: error instanceof Error ? error.message : String(error) };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { status: 'invalid', message: `It isn't valid JSON: ${(error as Error).message}` };
  }
  const checked = checkRegionData(parsed);
  if (!checked.ok) return { status: 'invalid', message: checked.message };

  const { generatedHash, ...project } = checked.project;
  return { status: 'loaded', project, generatedHash: generatedHash ?? null };
}

/** Reads the file for sending to the renderer. */
export async function readSavedRegions(root: string): Promise<SavedRegions> {
  const disk = await readRegionsFile(root);
  return disk.status === 'loaded' ? { status: 'loaded', project: disk.project } : disk;
}

function invalidFileMessage(detail: string): string {
  return `${REGIONS_FILE} couldn't be read, so it won't be overwritten. Fix or remove it, then try again. ${detail}`;
}

/**
 * Saves region data. The hash on disk is kept unless `generatedHash` gives a new one, and any hash
 * sent by the renderer is ignored, since it has to reflect what was really written.
 */
export async function saveRegions(
  root: string,
  data: unknown,
  generatedHash?: string,
): Promise<SaveResult> {
  const checked = checkRegionData(data);
  if (!checked.ok)
    return { ok: false, message: `The region data is not valid: ${checked.message}` };

  const disk = await readRegionsFile(root);
  if (disk.status === 'invalid') return { ok: false, message: invalidFileMessage(disk.message) };

  const contents: RegionProject = { ...checked.project };
  delete contents.generatedHash;
  const hash = generatedHash ?? (disk.status === 'loaded' ? disk.generatedHash : null);
  if (hash) contents.generatedHash = hash;
  await writeProjectFile(root, REGIONS_FILE, `${JSON.stringify(contents, null, 2)}\n`);
  return { ok: true };
}
