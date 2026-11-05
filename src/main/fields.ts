/**
 * Loads field definitions and images from folders. Definitions may come from a robot project, so
 * they're parsed defensively and an image is only ever read from the definition's own folder.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { isFieldId, parseFieldDefinition, type FieldDefinition } from '../shared/fields';

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
      if ((await stat(path)).size > MAX_IMAGE_BYTES) return null;
      const type = extname(path).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
      return `data:${type};base64,${(await readFile(path)).toString('base64')}`;
    } catch {
      return null;
    }
  }
  return null;
}
