/**
 * Loads field definitions and images from folders. Definitions may come from a robot project, so
 * they're parsed defensively and an image is only ever read from the definition's own folder.
 */
import { access, lstat, readdir, readFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { isFieldId, parseFieldDefinition, type FieldDefinition } from '../shared/fields';
import type { CustomFieldSpec, PickImageResult, SaveCustomFieldResult } from '../shared/ipc';
import { writeProjectFile } from './writer';

/** Refuses larger images, since each one is sent to the renderer as a data URL. */
const MAX_IMAGE_BYTES = 32 * 1024 * 1024;

async function readDefinition(dir: string, id: string): Promise<FieldDefinition | null> {
  try {
    return parseFieldDefinition(id, JSON.parse(await readFile(join(dir, `${id}.json`), 'utf8')));
  } catch {
    return null;
  }
}

/**
 * Lists the valid field definitions across folders, skipping invalid files and missing folders.
 * If an id appears twice, the later folder wins, so a project can override a bundled field.
 */
export async function listFields(dirs: readonly string[]): Promise<FieldDefinition[]> {
  const byId = new Map<string, FieldDefinition>();
  for (const dir of dirs) {
    const entries = await readdir(dir).catch(() => [] as string[]);
    for (const entry of entries) {
      if (extname(entry) !== '.json') continue;
      const definition = await readDefinition(dir, entry.slice(0, -'.json'.length));
      if (definition) byId.set(definition.id, definition);
    }
  }
  return [...byId.values()].sort((a, b) => b.id.localeCompare(a.id));
}

/** Returns a field's image as a data URL, or null if it's unavailable or too large. */
export async function getFieldImage(dirs: readonly string[], id: string): Promise<string | null> {
  if (!isFieldId(id)) return null;
  for (const dir of [...dirs].reverse()) {
    const definition = await readDefinition(dir, id);
    if (!definition) continue;
    const path = join(dir, definition.imageFile);
    try {
      // A link could point anywhere on the disk, and these folders can come from a robot project.
      const info = await lstat(path);
      if (!info.isFile() || info.size > MAX_IMAGE_BYTES) return null;
      const type = extname(path).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
      return `data:${type};base64,${(await readFile(path)).toString('base64')}`;
    } catch {
      return null;
    }
  }
  return null;
}

/** Where imported fields are kept in a project, so the team shares them through git. */
export const PROJECT_FIELDS_DIR = '.regionbool/fields';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

/** Identifies an image from its contents, since a file's extension can't be trusted. */
function imageType(bytes: Uint8Array): 'png' | 'jpeg' | null {
  const startsWith = (signature: number[]) => signature.every((byte, i) => bytes[i] === byte);
  if (startsWith(PNG_SIGNATURE)) return 'png';
  return startsWith(JPEG_SIGNATURE) ? 'jpeg' : null;
}

/** An image the user picked, held until it's imported. */
export interface PickedImage {
  fileName: string;
  bytes: Uint8Array;
  type: 'png' | 'jpeg';
}

/** Reads an image the user picked in a file dialog. */
export async function readPickedImage(
  path: string,
): Promise<{ result: PickImageResult; image: PickedImage | null }> {
  const invalid = (message: string) => ({
    result: { status: 'invalid' as const, message },
    image: null,
  });
  const fileName = basename(path);
  let bytes: Buffer;
  try {
    if ((await lstat(path)).size > MAX_IMAGE_BYTES)
      return invalid(`${fileName} is larger than 32 MB.`);
    bytes = await readFile(path);
  } catch {
    return invalid(`${fileName} couldn't be read.`);
  }
  const type = imageType(bytes);
  if (!type) return invalid(`${fileName} isn't a PNG or JPEG image.`);
  return {
    result: {
      status: 'picked',
      fileName,
      dataUrl: `data:image/${type};base64,${bytes.toString('base64')}`,
    },
    image: { fileName, bytes, type },
  };
}

/** Turns a display name into a field id: "My Field 2026!" becomes `my-field-2026`. */
export function toFieldId(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'field';
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

/** Copies an image into the project with its definition. Doesn't replace an existing field. */
export async function saveCustomField(
  root: string,
  image: PickedImage,
  spec: CustomFieldSpec,
): Promise<SaveCustomFieldResult> {
  const name = typeof spec?.name === 'string' ? spec.name.trim() : '';
  if (!name) return { ok: false, message: 'The field needs a name.' };

  const base = toFieldId(name);
  let id = base;
  for (let n = 2; await exists(join(root, PROJECT_FIELDS_DIR, `${id}.json`)); n++)
    id = `${base}-${n}`;

  const imageFile = `${id}.${image.type === 'png' ? 'png' : 'jpg'}`;
  const json = {
    game: name,
    'field-image': imageFile,
    'field-corners': { 'top-left': spec.topLeftPixel, 'bottom-right': spec.bottomRightPixel },
    'field-size': [spec.lengthMeters, spec.widthMeters],
    symmetry: spec.symmetry,
    'image-rotated': spec.imageRotated === true,
  };
  // The same parser that reads these files decides whether the values are acceptable.
  const field = parseFieldDefinition(id, json);
  if (!field || field.symmetry === null) {
    return { ok: false, message: 'Check the field size, the marked corners and the symmetry.' };
  }

  await writeProjectFile(root, `${PROJECT_FIELDS_DIR}/${imageFile}`, image.bytes);
  await writeProjectFile(
    root,
    `${PROJECT_FIELDS_DIR}/${id}.json`,
    `${JSON.stringify(json, null, 2)}\n`,
  );
  return { ok: true, field };
}
