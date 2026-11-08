/**
 * Compiles generated code against real WPILib jars, to catch a stub in `java-crosscheck.test.ts`
 * that doesn't match the real API. Jars come from a WPILib install in ~/wpilib, using that install's
 * own JDK, or else from the Gradle cache. Skipped when neither has them, or when the only JDK is too
 * old to read them, so run this on a machine with WPILib installed.
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
import type { FieldOrigin } from '../../src/shared/model';
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

const WPILIB_HOME = join(homedir(), 'wpilib');

/** A set of real WPILib jars, and the compiler to use with them. */
interface RealWpilib {
  version: string;
  classpath: string[];
  javac: string;
}

/** Looks through ~/wpilib installs for the newest version, using the JDK that came with it. */
function findInInstalls(group: string, mathArtifact: string, pattern: RegExp): RealWpilib | null {
  if (!existsSync(WPILIB_HOME)) return null;
  const found = readdirSync(WPILIB_HOME).flatMap((install) => {
    const maven = join(WPILIB_HOME, install, 'maven', group);
    const versions = join(maven, mathArtifact);
    if (!existsSync(versions)) return [];
    return readdirSync(versions)
      .filter((version) => pattern.test(version))
      .map((version) => ({ install, maven, version }));
  });
  const newest = found
    .sort((a, b) => a.version.localeCompare(b.version, 'en', { numeric: true }))
    .at(-1);
  if (!newest) return null;
  return {
    version: newest.version,
    classpath: findJars(newest.maven).filter(
      (jar) => jar.includes(`${sep}${newest.version}${sep}`) && /-java-/.test(jar),
    ),
    javac: join(WPILIB_HOME, newest.install, 'jdk/bin/javac'),
  };
}

function findInGradleCache(
  groupPrefix: string,
  mathPath: string,
  pattern: RegExp,
): RealWpilib | null {
  const version = latestVersion(mathPath, pattern);
  if (!version) return null;
  return { version, classpath: classpathFor(groupPrefix, version), javac: 'javac' };
}

const legacy =
  findInInstalls('edu/wpi/first', 'wpimath/wpimath-java', /^202[56]\./) ??
  findInGradleCache('edu.wpi.first.', 'edu.wpi.first.wpimath/wpimath-java', /^202[56]\./);
const modern =
  findInInstalls('org/wpilib', 'wpimath/wpimath-java', /^2027\./) ??
  findInGradleCache('org.wpilib', 'org.wpilib.wpimath/wpimath-java', /^2027\./);

const ORIGINS: readonly FieldOrigin[] = ['blue-corner', 'center'];
const tempDirs: string[] = [];
afterAll(() => tempDirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function compile(
  profile: JavaProfile,
  wpilib: RealWpilib,
  fieldOrigin: FieldOrigin,
): { status: number | null; stderr: string } {
  const base = sampleProject();
  const project = { ...base, output: { ...base.output, fieldOrigin } };
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
    wpilib.classpath.join(delimiter),
    file,
  ];
  return spawnSync(wpilib.javac, args, {
    cwd: root,
    encoding: 'utf8',
  });
}

describe('generated Java compiles against real WPILib', () => {
  it.skipIf(!legacy)(
    `legacy profile with ${legacy?.version}`,
    () => {
      for (const origin of ORIGINS) {
        const result = compile(JAVA_PROFILES.legacy, legacy!, origin);
        expect(result.status, result.stderr).toBe(0);
      }
    },
    60_000,
  );

  it.skipIf(!modern)(
    `modern profile with ${modern?.version}`,
    (context) => {
      for (const origin of ORIGINS) {
        const result = compile(JAVA_PROFILES.modern, modern!, origin);
        // 2027 jars need a newer JDK than some machines have, which says nothing about the code.
        if (/class file has wrong version/.test(result.stderr)) context.skip();
        expect(result.status, result.stderr).toBe(0);
      }
    },
    60_000,
  );
});
