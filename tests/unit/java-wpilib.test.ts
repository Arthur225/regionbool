/**
 * Compiles generated code against real WPILib jars from the local Gradle cache, to catch a stub in
 * `java-crosscheck.test.ts` that doesn't match the real API. Skipped when the jars aren't present
 * or need a newer JDK than the one installed, so run this on a machine that has built a robot project.
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { delimiter, join, sep } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { generateJava } from '../../src/shared/codegen';
import { JAVA_PROFILES, type JavaProfile } from '../../src/shared/javaProfiles';
import { sampleProject } from './fixtures/sampleProject';

const GRADLE_CACHE = join(homedir(), '.gradle/caches/modules-2/files-2.1');

function findJars(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return findJars(path);
    return /\.jar$/.test(entry) && !/-(sources|javadoc)\.jar$/.test(entry) ? [path] : [];
  });
}

/** All cached jars of one WPILib version, so transitive dependencies resolve. */
function classpathFor(groupPrefix: string, version: string): string[] {
  if (!existsSync(GRADLE_CACHE)) return [];
  return readdirSync(GRADLE_CACHE)
    .filter((group) => group.startsWith(groupPrefix))
    .flatMap((group) => findJars(join(GRADLE_CACHE, group)))
    .filter((jar) => jar.includes(`${sep}${version}${sep}`) && /-java-/.test(jar));
}

function latestVersion(groupPath: string, pattern: RegExp): string | null {
  const dir = join(GRADLE_CACHE, groupPath);
  if (!existsSync(dir)) return null;
  return (
    readdirSync(dir)
      .filter((version) => pattern.test(version))
      .sort()
      .at(-1) ?? null
  );
}

const legacyVersion = latestVersion('edu.wpi.first.wpimath/wpimath-java', /^202[56]\./);
const modernVersion = latestVersion('org.wpilib.wpimath/wpimath-java', /^2027\./);

const tempDirs: string[] = [];
afterAll(() => tempDirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function compile(
  profile: JavaProfile,
  classpath: string[],
): { status: number | null; stderr: string } {
  const project = sampleProject();
  const root = mkdtempSync(join(tmpdir(), 'regionbool-wpilib-'));
  tempDirs.push(root);
  const dir = join(root, 'frc/robot/generated');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'FieldRegions.java');
  writeFileSync(file, generateJava(project, profile));
  // An empty processor path stops javac from loading annotation processors found in the jars.
  const emptyDir = join(root, 'no-processors');
  mkdirSync(emptyDir);
  const args = [
    '-proc:none',
    '-processorpath',
    emptyDir,
    '-d',
    'classes',
    '-cp',
    classpath.join(delimiter),
    file,
  ];
  return spawnSync('javac', args, {
    cwd: root,
    encoding: 'utf8',
  });
}

describe('generated Java compiles against real WPILib', () => {
  it.skipIf(!legacyVersion)(
    `legacy profile with ${legacyVersion}`,
    () => {
      const result = compile(JAVA_PROFILES.legacy, classpathFor('edu.wpi.first.', legacyVersion!));
      expect(result.status, result.stderr).toBe(0);
    },
    60_000,
  );

  it.skipIf(!modernVersion)(
    `modern profile with ${modernVersion}`,
    (context) => {
      const result = compile(JAVA_PROFILES.modern, classpathFor('org.wpilib', modernVersion!));
      // Alpha jars need a JDK newer than some machines have, which says nothing about the generated code.
      if (/class file has wrong version/.test(result.stderr)) context.skip();
      expect(result.status, result.stderr).toBe(0);
    },
    60_000,
  );
});
