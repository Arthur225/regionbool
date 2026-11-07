import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, test, type ElectronApplication } from '@playwright/test';
import { launchApp } from './helpers';
import type { RegionBoolApi } from '../../src/shared/ipc';
import { sampleProject } from '../unit/fixtures/sampleProject';

/** Page callbacks run in the renderer, where the preload script defines this. */
declare const window: { regionbool: RegionBoolApi };

let app: ElectronApplication;
const folders: string[] = [];

function createFolder(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'regionbool-e2e-'));
  folders.push(root);
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), contents);
  }
  return root;
}

const robotProject = () =>
  createFolder({
    'build.gradle':
      'id "edu.wpi.first.GradleRIO" version "2026.1.1"\ndef ROBOT_MAIN_CLASS = "frc.robot.Main"',
    '.wpilib/wpilib_preferences.json':
      '{"currentLanguage":"java","projectYear":"2026","teamNumber":1156}',
    'src/main/java/frc/robot/Robot.java':
      'import edu.wpi.first.wpilibj.TimedRobot;\nclass Robot {}',
  });

/** Makes the next folder dialog return `path`, since a native dialog can't be driven by a test. */
async function chooseFolderInDialog(path: string | null): Promise<void> {
  await app.evaluate(({ dialog }, chosen) => {
    dialog.showOpenDialog = (() =>
      Promise.resolve({
        canceled: chosen === null,
        filePaths: chosen ? [chosen] : [],
      })) as typeof dialog.showOpenDialog;
  }, path);
}

test.beforeAll(async () => {
  ({ app } = await launchApp());
});

test.afterAll(async () => {
  await app.close();
  for (const folder of folders) rmSync(folder, { recursive: true, force: true });
});

test('the window loads and reaches the main process through the bridge', async () => {
  const page = await app.firstWindow();
  await expect(page.getByRole('heading', { name: 'RegionBool' })).toBeVisible();
  await expect(page.getByTestId('app-version')).toContainText('Version');
});

test('the renderer has no direct access to Node or IPC', async () => {
  const page = await app.firstWindow();
  const exposed = await page.evaluate(() => ({
    require: typeof (globalThis as Record<string, unknown>)['require'],
    process: typeof (globalThis as Record<string, unknown>)['process'],
    bridgeKeys: Object.keys((globalThis as unknown as { regionbool: object }).regionbool),
  }));
  expect(exposed.require).toBe('undefined');
  expect(exposed.process).toBe('undefined');
  // This list is everything the renderer can reach, so growing it should be a deliberate change.
  expect(exposed.bridgeKeys.sort()).toEqual([
    'closeProject',
    'getAppInfo',
    'getCurrentProject',
    'getFieldImage',
    'listFields',
    'openLastProject',
    'openProject',
    'pickFieldImage',
    'previewExport',
    'saveCustomField',
    'saveRegions',
    'writeExport',
  ]);
});

test('the window is configured with the expected security settings', async () => {
  const prefs = await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) throw new Error('No window');
    // Not in Electron's public types, but it's the only way to read back the applied settings.
    const contents = window.webContents as unknown as { getLastWebPreferences(): object };
    return contents.getLastWebPreferences();
  });
  expect(prefs).toMatchObject({ contextIsolation: true, nodeIntegration: false, sandbox: true });
});

test('export is refused before a project is open', async () => {
  const page = await app.firstWindow();
  const result = await page.evaluate(
    (project) => window.regionbool.previewExport(project, 'legacy'),
    sampleProject(),
  );
  expect(result).toMatchObject({ ok: false, message: 'No project is open.' });
});

test('canceling the dialog changes nothing', async () => {
  const page = await app.firstWindow();
  await chooseFolderInDialog(null);
  await page.getByRole('button', { name: 'Open robot project' }).click();
  await expect(page.getByTestId('project-details')).toHaveCount(0);
  await expect(page.getByTestId('project-error')).toHaveCount(0);
});

test('a folder that is not a robot project shows why', async () => {
  const page = await app.firstWindow();
  await chooseFolderInDialog(createFolder({ 'readme.txt': 'hello' }));
  await page.getByRole('button', { name: 'Open robot project' }).click();
  await expect(page.getByTestId('project-error')).toContainText('build.gradle');
  expect(await page.evaluate(() => window.regionbool.getCurrentProject())).toBeNull();
});

test('a robot project opens, and generated code reaches disk only through the export flow', async () => {
  const page = await app.firstWindow();
  const root = robotProject();
  await chooseFolderInDialog(root);
  await page.getByRole('button', { name: 'Open robot project' }).click();
  const details = page.getByTestId('project-details');
  await expect(details).toContainText('2026.1.1');
  await expect(details).toContainText('edu.wpi.first');
  await expect(page.getByTestId('output-package')).toHaveValue('frc.robot.generated');

  const target = join(root, 'src/main/java/frc/robot/generated/FieldRegions.java');
  const preview = await page.evaluate(
    (project) => window.regionbool.previewExport(project, 'legacy'),
    sampleProject(),
  );
  expect(preview).toMatchObject({ ok: true, status: 'new' });
  expect(existsSync(target)).toBe(false);

  const written = await page.evaluate(
    (project) => window.regionbool.writeExport(project, 'legacy', null),
    sampleProject(),
  );
  expect(written).toMatchObject({ ok: true });
  expect(readFileSync(target, 'utf8')).toContain(
    'public static boolean isInScoringZone(Pose2d pose)',
  );

  // A hand-written file must survive, even if the renderer asks with the right hash.
  const handWritten = 'public class FieldRegions {}';
  writeFileSync(target, handWritten);
  const outcome = await page.evaluate(async (project) => {
    const check = await window.regionbool.previewExport(project, 'legacy');
    const hash = check.ok ? check.existingHash : null;
    return { check, write: await window.regionbool.writeExport(project, 'legacy', hash) };
  }, sampleProject());
  expect(outcome.check).toMatchObject({ ok: true, status: 'not-generated' });
  expect(outcome.write.ok).toBe(false);
  expect(readFileSync(target, 'utf8')).toBe(handWritten);
});

test('bad field ids return nothing', async () => {
  const page = await app.firstWindow();
  expect(await page.evaluate(() => window.regionbool.getFieldImage('../../etc/passwd'))).toBeNull();
});
