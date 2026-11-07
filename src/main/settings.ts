/**
 * The app's own settings, kept in Electron's user data folder rather than in any robot project,
 * because they belong to this computer. A missing or damaged file just means default settings.
 */
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const SETTINGS_FILE = 'settings.json';

/** Everything the app remembers between runs. */
export interface AppSettings {
  /** Absolute path of the project to reopen at startup, or null if there isn't one. */
  lastProjectPath: string | null;
}

/** Reads the settings, falling back to defaults if the file is missing or can't be understood. */
export async function readSettings(dir: string): Promise<AppSettings> {
  try {
    const data: unknown = JSON.parse(await readFile(join(dir, SETTINGS_FILE), 'utf8'));
    const path = (data as { lastProjectPath?: unknown } | null)?.lastProjectPath;
    return { lastProjectPath: typeof path === 'string' && path.length > 0 ? path : null };
  } catch {
    return { lastProjectPath: null };
  }
}

/** Saves the settings atomically, so a crash can't leave a half-written file. */
export async function writeSettings(dir: string, settings: AppSettings): Promise<void> {
  await mkdir(dir, { recursive: true });
  const temp = join(dir, `.settings-${randomBytes(6).toString('hex')}.tmp`);
  try {
    await writeFile(temp, `${JSON.stringify(settings, null, 2)}\n`, { flag: 'wx' });
    await rename(temp, join(dir, SETTINGS_FILE));
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}
