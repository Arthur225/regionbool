import { afterAll, describe, expect, it } from 'vitest';
import { GENERATED_HEADER } from '../../src/shared/codegen';
import { chooseProfile, detectProject } from '../../src/main/project';
import {
  createFolder,
  createRobotProject,
  GRADLE_2027_ALPHA1,
  removeCreatedFolders,
} from './fixtures/robotProject';

afterAll(removeCreatedFolders);

const LEGACY_FILE = 'import edu.wpi.first.math.geometry.Pose2d;\nclass A {}\n';
const MODERN_FILE = 'import org.wpilib.math.geometry.Pose2d;\nclass B {}\n';

describe('detectProject', () => {
  it('reads a valid project', async () => {
    const root = createRobotProject({ 'src/main/java/frc/robot/A.java': LEGACY_FILE });
    const result = await detectProject(root);
    expect(result).toMatchObject({
      valid: true,
      project: {
        root,
        gradleRioPlugin: 'edu.wpi.first.GradleRIO',
        gradleRioVersion: '2026.1.1',
        projectYear: '2026',
        teamNumber: 1156,
        defaultPackageName: 'frc.robot.generated',
        profile: { id: 'legacy', source: 'imports', confident: true, legacyImports: 1 },
      },
    });
  });

  it('uses imports rather than the year for a 2027 alpha-1 project', async () => {
    const root = createRobotProject({ 'src/main/java/A.java': LEGACY_FILE }, GRADLE_2027_ALPHA1);
    const result = await detectProject(root);
    expect(result.valid && result.project.profile).toMatchObject({
      id: 'legacy',
      source: 'imports',
    });
  });

  it('detects org.wpilib imports as modern', async () => {
    const root = createRobotProject({ 'src/main/java/A.java': MODERN_FILE });
    const result = await detectProject(root);
    expect(result.valid && result.project.profile).toMatchObject({ id: 'modern', confident: true });
  });

  it('ignores its own generated file when counting imports', async () => {
    const root = createRobotProject({
      'src/main/java/A.java': LEGACY_FILE,
      'src/main/java/generated/FieldRegions.java': `${GENERATED_HEADER}\n${MODERN_FILE}${MODERN_FILE}`,
    });
    const result = await detectProject(root);
    expect(result.valid && result.project.profile).toMatchObject({
      id: 'legacy',
      modernImports: 0,
      confident: true,
    });
  });

  it('suggests a package from the main class', async () => {
    const gradle =
      'id "edu.wpi.first.GradleRIO" version "2026.1.1"\ndef ROBOT_MAIN_CLASS = "org.team1156.robot.Main"';
    const result = await detectProject(createRobotProject({}, gradle));
    expect(result.valid && result.project.defaultPackageName).toBe('org.team1156.robot.generated');
  });

  it('falls back when the main class is not usable', async () => {
    const gradle =
      'id "edu.wpi.first.GradleRIO" version "2026.1.1"\ndef ROBOT_MAIN_CLASS = "class.Main"';
    const result = await detectProject(createRobotProject({}, gradle));
    expect(result.valid && result.project.defaultPackageName).toBe('frc.robot.generated');
  });

  it.each<[string, Record<string, string>, string]>([
    ['an empty folder', {}, 'no build.gradle'],
    ['no preferences', { 'build.gradle': 'GradleRIO' }, 'no .wpilib'],
    [
      'a non-GradleRIO build',
      {
        'build.gradle': 'plugins {}',
        '.wpilib/wpilib_preferences.json': '{"currentLanguage":"java"}',
      },
      'does not use the GradleRIO',
    ],
    [
      'a C++ project',
      {
        'build.gradle': 'GradleRIO',
        '.wpilib/wpilib_preferences.json': '{"currentLanguage":"cpp"}',
      },
      'only supports Java',
    ],
    [
      'malformed preferences',
      { 'build.gradle': 'GradleRIO', '.wpilib/wpilib_preferences.json': '{oops' },
      'could not be read',
    ],
  ])('rejects %s', async (_label, files, expected) => {
    const result = await detectProject(createFolder(files));
    expect(result.valid).toBe(false);
    expect(!result.valid && result.reasons.join(' ')).toContain(expected);
  });
});

describe('chooseProfile', () => {
  it('asks for confirmation when imports are mixed, using the majority', () => {
    expect(chooseProfile(5, 2, null, null)).toMatchObject({ id: 'legacy', confident: false });
    expect(chooseProfile(1, 9, null, null)).toMatchObject({ id: 'modern', confident: false });
  });

  it('uses GradleRIO when there are no imports', () => {
    expect(chooseProfile(0, 0, 'edu.wpi.first.GradleRIO', '2025.3.2')).toMatchObject({
      id: 'legacy',
      source: 'gradle',
      confident: true,
    });
    expect(chooseProfile(0, 0, 'org.wpilib.GradleRIO', '2027.0.0-alpha-6')).toMatchObject({
      id: 'modern',
      confident: true,
    });
  });

  it('treats a 2027 alpha under the old plugin id as only a guess', () => {
    expect(chooseProfile(0, 0, 'edu.wpi.first.GradleRIO2027', '2027.0.0-alpha-1')).toMatchObject({
      id: 'legacy',
      confident: false,
    });
  });

  it('returns no profile with no evidence', () => {
    expect(chooseProfile(0, 0, null, null)).toMatchObject({ id: null, source: 'none' });
  });
});
