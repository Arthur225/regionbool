/** Recognizes WPILib Java projects and works out which WPILib API generation they use. */
import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { GENERATED_HEADER } from '../shared/codegen';
import type { ProfileDetection, ProjectInfo } from '../shared/ipc';
import { isJavaPackageName } from '../shared/model';

/** Stops scanning very large projects. Far more files than any robot project needs for a verdict. */
const MAX_JAVA_FILES_SCANNED = 5000;
const FALLBACK_PACKAGE = 'frc.robot.generated';

/** The result of checking a folder. */
export type DetectionResult =
  { valid: true; project: ProjectInfo } | { valid: false; reasons: string[] };

async function readTextIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

/** Counts legacy and modern WPILib imports in all Java files under `dir`, without following links. */
async function countImports(dir: string): Promise<{ legacy: number; modern: number }> {
  const counts = { legacy: 0, modern: 0 };
  let scanned = 0;
  const pending = [dir];
  while (pending.length > 0 && scanned < MAX_JAVA_FILES_SCANNED) {
    const current = pending.pop()!;
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(path);
      } else if (entry.isFile() && entry.name.endsWith('.java')) {
        scanned++;
        const source = await readTextIfExists(path);
        // Skip our own output, so a wrong choice can't reinforce itself on the next detection.
        if (!source || source.startsWith(GENERATED_HEADER)) continue;
        counts.legacy += source.match(/^\s*import\s+(static\s+)?edu\.wpi\.first\./gm)?.length ?? 0;
        counts.modern += source.match(/^\s*import\s+(static\s+)?org\.wpilib\./gm)?.length ?? 0;
      }
    }
  }
  return counts;
}

/**
 * Decides the profile. Imports win because the WPILib year doesn't decide it: a 2027 alpha-1 project
 * uses `edu.wpi.first` while alpha-6 uses `org.wpilib`. The GradleRIO version is used only when
 * there are no imports to read, and for 2027 alphas it's only a guess.
 */
export function chooseProfile(
  legacyImports: number,
  modernImports: number,
  plugin: string | null,
  version: string | null,
): ProfileDetection {
  const counts = { legacyImports, modernImports };
  if (legacyImports > 0 || modernImports > 0) {
    return {
      id: modernImports > legacyImports ? 'modern' : 'legacy',
      source: 'imports',
      confident: legacyImports === 0 || modernImports === 0,
      ...counts,
    };
  }
  if (plugin?.startsWith('org.wpilib')) {
    return { id: 'modern', source: 'gradle', confident: true, ...counts };
  }
  if (version?.startsWith('2025') || version?.startsWith('2026')) {
    return { id: 'legacy', source: 'gradle', confident: true, ...counts };
  }
  if (plugin) return { id: 'legacy', source: 'gradle', confident: false, ...counts };
  return { id: null, source: 'none', confident: false, ...counts };
}

/** Suggests a package next to the robot's main class, such as `frc.robot.generated`. */
function defaultPackage(buildGradle: string): string {
  const mainClass = /ROBOT_MAIN_CLASS\s*=\s*["']([^"']+)["']/.exec(buildGradle)?.[1];
  const parent = mainClass?.split('.').slice(0, -1).join('.');
  const candidate = parent ? `${parent}.generated` : FALLBACK_PACKAGE;
  return isJavaPackageName(candidate) ? candidate : FALLBACK_PACKAGE;
}

/**
 * Checks whether a folder is a WPILib Java project, and gathers what the app needs to know about it.
 * Only reads files.
 */
export async function detectProject(root: string): Promise<DetectionResult> {
  const reasons: string[] = [];

  const buildGradle = await readTextIfExists(join(root, 'build.gradle'));
  if (buildGradle === null) {
    reasons.push('There is no build.gradle file in this folder.');
  } else if (!buildGradle.includes('GradleRIO')) {
    reasons.push('build.gradle does not use the GradleRIO plugin.');
  }

  let preferences: Record<string, unknown> | null = null;
  const preferencesText = await readTextIfExists(join(root, '.wpilib/wpilib_preferences.json'));
  if (preferencesText === null) {
    reasons.push('There is no .wpilib/wpilib_preferences.json file in this folder.');
  } else {
    try {
      const parsed: unknown = JSON.parse(preferencesText);
      if (typeof parsed === 'object' && parsed !== null) {
        preferences = parsed as Record<string, unknown>;
      }
    } catch {
      // Reported below, the same as a file with the wrong contents.
    }
    if (preferences === null) {
      reasons.push('.wpilib/wpilib_preferences.json could not be read.');
    } else if (preferences['currentLanguage'] !== 'java') {
      reasons.push(
        `This project's language is "${String(preferences['currentLanguage'])}", and RegionBool only supports Java.`,
      );
    }
  }

  if (reasons.length > 0 || buildGradle === null || preferences === null) {
    return { valid: false, reasons };
  }

  const plugin = /id\s+["']([\w.]*GradleRIO\w*)["']\s+version\s+["']([^"']+)["']/.exec(buildGradle);
  const gradleRioPlugin = plugin?.[1] ?? null;
  const gradleRioVersion = plugin?.[2] ?? null;
  const imports = await countImports(join(root, 'src/main/java'));
  const { projectYear, teamNumber } = preferences;

  return {
    valid: true,
    project: {
      root,
      name: basename(root),
      gradleRioPlugin,
      gradleRioVersion,
      projectYear: typeof projectYear === 'string' ? projectYear : null,
      teamNumber: typeof teamNumber === 'number' ? teamNumber : null,
      profile: chooseProfile(imports.legacy, imports.modern, gradleRioPlugin, gradleRioVersion),
      defaultPackageName: defaultPackage(buildGradle),
    },
  };
}
