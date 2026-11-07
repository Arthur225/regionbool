/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/**
 * Checks the packaged app rather than the development build. The risks here are different: files
 * left out of the package, resources in the wrong place, and dependencies that weren't included.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import {
  chooseFolderInDialog,
  createRobotProject,
  drawRect,
  launchApp,
  removeCreatedFolders,
} from '../e2e/helpers';

/** Finds the packaged app for this machine. */
function packagedExecutable(): string {
  const release = join(__dirname, '../../release');
  const candidates: Partial<Record<NodeJS.Platform, string[]>> = {
    darwin: [
      join(
        release,
        process.arch === 'arm64' ? 'mac-arm64' : 'mac',
        'RegionBool.app/Contents/MacOS/RegionBool',
      ),
    ],
    win32: [join(release, 'win-unpacked/RegionBool.exe')],
    linux: [join(release, 'linux-unpacked/regionbool')],
  };
  const found = candidates[process.platform]?.find(existsSync);
  if (!found) {
    throw new Error(`No packaged app found. release/ has: ${readdirSync(release).join(', ')}`);
  }
  return found;
}

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  ({ app, page } = await launchApp(packagedExecutable()));
});

test.afterAll(async () => {
  await app.close();
  removeCreatedFolders();
});

test('runs as a packaged app', async () => {
  expect(await app.evaluate(({ app: electronApp }) => electronApp.isPackaged)).toBe(true);
  await expect(page.getByRole('heading', { name: 'RegionBool' })).toBeVisible();
});

test('includes the bundled fields and images', async () => {
  const options = await page
    .getByLabel('Field', { exact: true })
    .locator('option')
    .allTextContents();
  expect(options).toContain('2026 Rebuilt (welded field)');
  expect(options).toContain('2022 Rapid React');
  await expect(page.getByTestId('field-image')).toBeAttached();
  const decoded = await page
    .getByTestId('field-image')
    .evaluate((image) => (image.getAttribute('href') ?? '').startsWith('data:image/png;base64,'));
  expect(decoded).toBe(true);
});

test('exports to a project, which needs the schema validator from the package', async () => {
  const root = createRobotProject();
  await chooseFolderInDialog(app, root);
  await page.getByRole('button', { name: 'Open robot project' }).click();
  await expect(page.getByTestId('project-details')).toBeVisible();
  await drawRect(page, [2, 1], [6, 4]);
  await page.getByRole('button', { name: 'Export Java' }).click();
  await page.getByRole('button', { name: 'Write file' }).click();
  await expect(page.getByTestId('export-success')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();

  const java = readFileSync(
    join(root, 'src/main/java/frc/robot/generated/FieldRegions.java'),
    'utf8',
  );
  expect(java).toContain('public static boolean isInRegion1(Pose2d pose)');
  expect(existsSync(join(root, '.regionbool/regions.json'))).toBe(true);
});

test('includes the bundled fonts, so it works offline', async () => {
  const loaded = await page.evaluate(async () => {
    const fonts = (globalThis as unknown as { document: { fonts: FontFaceSet } }).document.fonts;
    await fonts.ready;
    return [...fonts].filter((font) => font.status === 'loaded').map((font) => font.family);
  });
  expect(loaded.join()).toContain('Barlow');
});

test('uses the RegionBool icon on macOS', () => {
  test.skip(process.platform !== 'darwin', 'Other systems embed the icon differently');
  const resources = join(dirname(packagedExecutable()), '../Resources');
  // electron-builder only writes icon.icns when it found our icon. Electron's own is electron.icns.
  expect(existsSync(join(resources, 'icon.icns'))).toBe(true);
  expect(existsSync(join(resources, 'electron.icns'))).toBe(false);
});

test('keeps the sandbox on', async () => {
  const prefs = await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    const contents = window!.webContents as unknown as { getLastWebPreferences(): object };
    return contents.getLastWebPreferences();
  });
  expect(prefs).toMatchObject({ contextIsolation: true, nodeIntegration: false, sandbox: true });
});
