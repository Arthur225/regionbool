import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/** A build.gradle like a real 2026 project's. */
export const GRADLE_2026 = `plugins {
    id "java"
    id "edu.wpi.first.GradleRIO" version "2026.1.1"
}
def ROBOT_MAIN_CLASS = "frc.robot.Main"
`;

/** A build.gradle like the real 2027 alpha-1 project's, which still imports edu.wpi.first. */
export const GRADLE_2027_ALPHA1 = `plugins {
    id "edu.wpi.first.GradleRIO2027" version "2027.0.0-alpha-1"
}
def ROBOT_MAIN_CLASS = "frc.robot.Main"
`;

const created: string[] = [];

/** Creates a temporary folder holding the given files, with paths relative to it. */
export function createFolder(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'regionbool-project-'));
  created.push(root);
  for (const [path, contents] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, contents);
  }
  return root;
}

/** Creates a valid robot project, with any extra files. */
export function createRobotProject(
  extraFiles: Record<string, string> = {},
  gradle: string = GRADLE_2026,
): string {
  return createFolder({
    'build.gradle': gradle,
    '.wpilib/wpilib_preferences.json': JSON.stringify({
      currentLanguage: 'java',
      projectYear: '2026',
      teamNumber: 1156,
    }),
    ...extraFiles,
  });
}

/** Deletes every folder created so far. Call from `afterAll`. */
export function removeCreatedFolders(): void {
  for (const folder of created.splice(0)) rmSync(folder, { recursive: true, force: true });
}
