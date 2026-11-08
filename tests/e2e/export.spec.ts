/** The whole workflow: draw, save, reopen and export to a real folder on disk. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import {
  chooseFolderInDialog,
  createFolder,
  createRobotProject,
  drawRect,
  freshPage,
  launchApp,
  removeCreatedFolders,
  setUnsavedPromptAnswer,
} from './helpers';

const TARGET = 'src/main/java/frc/robot/generated/FieldRegions.java';
const REGIONS = '.regionbool/regions.json';

let app: ElectronApplication;
let page: Page;
let confirmAnswer = true;
let confirmMessages: string[] = [];

test.beforeAll(async () => {
  ({ app, page } = await launchApp());
  page.on('dialog', (dialog) => {
    if (dialog.type() === 'beforeunload') return; // Handled by the main process's prompt.
    confirmMessages.push(dialog.message());
    void (confirmAnswer ? dialog.accept() : dialog.dismiss());
  });
});

test.afterAll(async () => {
  await app.close();
  removeCreatedFolders();
});

test.beforeEach(async () => {
  confirmAnswer = true;
  confirmMessages = [];
  await setUnsavedPromptAnswer(app, 0);
  await freshPage(page);
});

async function open(root: string): Promise<void> {
  await chooseFolderInDialog(app, root);
  await page.getByRole('button', { name: 'Open robot project' }).click();
}

const exportButton = () => page.getByRole('button', { name: 'Export Java' });
const saveButton = () => page.getByRole('button', { name: 'Save', exact: true });
const writeButton = () =>
  page.getByTestId('export-dialog').getByRole('button', { name: /Write file|Replace edited file/ });

test('export needs a project', async () => {
  await expect(exportButton()).toBeDisabled();
  await expect(saveButton()).toBeDisabled();
});

test('a drawing made before opening a project carries over, then exports with a diff', async () => {
  const root = createRobotProject();
  await drawRect(page, [2, 1], [6, 4]);
  await page.getByLabel('Region name').fill('Scoring Zone');
  await open(root);
  await expect(page.getByTestId('method-name')).toHaveText('isInScoringZone()');

  await exportButton().click();
  await expect(page.getByTestId('export-status')).toContainText(`${TARGET} will be created`);
  await expect(page.getByTestId('export-diff')).toContainText('+ public final class FieldRegions');
  expect(existsSync(join(root, TARGET))).toBe(false);

  await writeButton().click();
  await expect(page.getByTestId('export-success')).toContainText(TARGET);
  await expect(page.getByTestId('export-dialog')).toContainText(
    'FieldRegions.isInScoringZone(pose)',
  );
  await page.getByRole('button', { name: 'Done' }).click();

  const java = readFileSync(join(root, TARGET), 'utf8');
  expect(java).toContain('public static boolean isInScoringZone(Pose2d pose)');
  expect(java).toContain('import edu.wpi.first.math.geometry.Pose2d;');
  expect(java).toContain('public static void publishTo(Field2d field)');
  const saved = JSON.parse(readFileSync(join(root, REGIONS), 'utf8'));
  expect(saved.regions[0].name).toBe('Scoring Zone');
  expect(saved.output.javaProfile).toBe('legacy');
  expect(saved.generatedHash).toMatch(/^[0-9a-f]{64}$/);
  await expect(page.getByTestId('unsaved')).toHaveCount(0);
});

test('the field-center option changes the numbers shown and the generated code', async () => {
  const root = createRobotProject();
  await open(root);
  await drawRect(page, [2, 1], [6, 4]);
  const cx = Number(await page.getByTestId('prop-cx').inputValue());

  await page.getByTestId('output-origin').selectOption('center');
  await saveButton().click();
  await expect(page.getByTestId('unsaved')).toHaveCount(0);
  const field = JSON.parse(readFileSync(join(root, REGIONS), 'utf8')).field;
  const half = field.lengthMeters / 2;
  await expect(page.getByTestId('prop-cx')).toHaveValue(
    String(Number((half - cx).toPrecision(12))),
  );

  // Typing a center-origin value stores it in blue-corner coordinates.
  await page.getByTestId('prop-cx').fill('1');
  await page.getByTestId('prop-cx').press('Enter');
  await saveButton().click();
  await expect(page.getByTestId('unsaved')).toHaveCount(0);
  const saved = JSON.parse(readFileSync(join(root, REGIONS), 'utf8'));
  expect(saved.output.fieldOrigin).toBe('center');
  expect(saved.regions[0].shapes[0].cx).toBeCloseTo(half - 1, 9);

  await exportButton().click();
  await writeButton().click();
  await page.getByRole('button', { name: 'Done' }).click();
  const java = readFileSync(join(root, TARGET), 'utf8');
  expect(java).toContain('double x = HALF_FIELD_LENGTH_METERS - point.getX();');
});

test('canceling export writes nothing', async () => {
  const root = createRobotProject();
  await open(root);
  await drawRect(page, [2, 1], [6, 4]);
  await exportButton().click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  expect(existsSync(join(root, TARGET))).toBe(false);
  expect(existsSync(join(root, REGIONS))).toBe(false);
  await expect(page.getByTestId('unsaved')).toBeVisible();
});

test('saved regions come back when the project is reopened', async () => {
  const root = createRobotProject();
  await open(root);
  await drawRect(page, [2, 1], [6, 4]);
  await page.getByLabel('Region name').fill('Saved Zone');
  await expect(page.getByTestId('unsaved')).toBeVisible();
  await saveButton().click();
  await expect(page.getByTestId('unsaved')).toHaveCount(0);
  expect(existsSync(join(root, REGIONS))).toBe(true);

  await freshPage(page);
  await expect(page.getByTestId('region-item')).toHaveCount(0);
  await open(root);
  await expect(page.getByLabel('Region name')).toHaveValue('Saved Zone');
  await expect(page.getByTestId('shape-rect')).toHaveCount(1);
  await expect(page.getByTestId('unsaved')).toHaveCount(0);
  // A loaded project has nothing to undo back into.
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
});

test('the keyboard saves, including a value still being typed', async () => {
  const root = createRobotProject();
  await open(root);
  await drawRect(page, [2, 1], [6, 4]);
  await page.getByTestId('prop-width').fill('9');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.getByTestId('unsaved')).toHaveCount(0);
  const saved = JSON.parse(readFileSync(join(root, REGIONS), 'utf8'));
  expect(saved.regions[0].shapes[0].width).toBe(9);
});

test('exporting again shows only the changes, and an unchanged file needs no diff', async () => {
  const root = createRobotProject();
  await open(root);
  await drawRect(page, [2, 1], [6, 4]);
  await exportButton().click();
  await writeButton().click();
  await page.getByRole('button', { name: 'Done' }).click();

  await exportButton().click();
  await expect(page.getByTestId('export-status')).toContainText('already up to date');
  await expect(page.getByTestId('export-diff')).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.getByLabel('Region name').fill('Renamed');
  await exportButton().click();
  const diff = page.getByTestId('export-diff');
  await expect(page.getByTestId('export-status')).toContainText('will be replaced');
  await expect(diff).toContainText('- ');
  await expect(diff).toContainText('+   public static boolean isInRenamed(Pose2d pose)');
  await expect(diff).toContainText('unchanged lines');
});

test('warns before replacing hand edits, and shows them', async () => {
  const root = createRobotProject();
  await open(root);
  await drawRect(page, [2, 1], [6, 4]);
  await exportButton().click();
  await writeButton().click();
  await page.getByRole('button', { name: 'Done' }).click();

  const java = readFileSync(join(root, TARGET), 'utf8');
  writeFileSync(join(root, TARGET), `${java}class MyChange {}\n`);
  await page.getByLabel('Region name').fill('Renamed');
  await exportButton().click();
  await expect(page.getByTestId('export-hand-edited')).toBeVisible();
  await expect(page.getByTestId('export-diff')).toContainText('- class MyChange {}');
  await expect(writeButton()).toHaveText('Replace edited file');
});

test('never replaces a hand-written file', async () => {
  const handWritten = 'public class FieldRegions { /* mine */ }';
  const root = createRobotProject({ [TARGET]: handWritten });
  await open(root);
  await drawRect(page, [2, 1], [6, 4]);
  await exportButton().click();
  await expect(page.getByTestId('export-blocked')).toBeVisible();
  await expect(writeButton()).toBeDisabled();
  expect(readFileSync(join(root, TARGET), 'utf8')).toBe(handWritten);

  // Changing the class name is the way out.
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByTestId('output-class').fill('MyRegions');
  await page.getByTestId('field-canvas').click({ position: { x: 5, y: 5 } });
  await exportButton().click();
  await expect(page.getByTestId('export-status')).toContainText('MyRegions.java will be created');
});

test('shows validation problems instead of a diff', async () => {
  const root = createRobotProject();
  await open(root);
  await page.getByRole('button', { name: 'Add region' }).click();
  await exportButton().click();
  await expect(page.getByTestId('export-problems')).toContainText('at least one shape');
  await expect(writeButton()).toBeDisabled();
});

test('asks which API to use when the project gives no clear answer', async () => {
  const root = createRobotProject({}, false);
  await open(root);
  await drawRect(page, [2, 1], [6, 4]);
  await exportButton().click();
  await expect(page.getByTestId('profile-needed')).toBeVisible();
  await expect(writeButton()).toBeDisabled();

  await page.getByLabel('WPILib API').selectOption('modern');
  await expect(page.getByTestId('export-diff')).toContainText(
    'import org.wpilib.math.geometry.Pose2d;',
  );
  await writeButton().click();
  await page.getByRole('button', { name: 'Done' }).click();

  // The choice is remembered.
  await exportButton().click();
  await expect(page.getByLabel('WPILib API')).toHaveValue('modern');
  await expect(page.getByTestId('profile-needed')).toHaveCount(0);
});

test('a broken regions file is reported and never overwritten', async () => {
  const root = createRobotProject({ [REGIONS]: '{ broken' });
  await open(root);
  await expect(page.getByTestId('project-error')).toContainText("couldn't be read");
  await drawRect(page, [2, 1], [6, 4]);
  await saveButton().click();
  await expect(page.getByTestId('project-error')).toContainText('Save failed');
  expect(readFileSync(join(root, REGIONS), 'utf8')).toBe('{ broken');
});

test('a regions file from a newer version is refused', async () => {
  const root = createRobotProject({ [REGIONS]: JSON.stringify({ version: 2 }) });
  await open(root);
  await expect(page.getByTestId('project-error')).toContainText("couldn't be read");
  await expect(page.getByTestId('region-item')).toHaveCount(0);
});

test.describe('protecting unsaved work', () => {
  test('confirms before opening over unsaved changes', async () => {
    const first = createRobotProject();
    await open(first);
    await drawRect(page, [2, 1], [6, 4]);

    confirmAnswer = false;
    await page.getByRole('button', { name: 'Open robot project' }).click();
    await expect.poll(() => confirmMessages.length).toBe(1);
    await expect(page.getByTestId('region-item')).toHaveCount(1);

    confirmAnswer = true;
    await open(createRobotProject());
    await expect(page.getByTestId('region-item')).toHaveCount(0);
  });

  test("declining to replace a drawing leaves the project closed, so it can't overwrite anything", async () => {
    const root = createRobotProject();
    await open(root);
    await drawRect(page, [2, 1], [6, 4]);
    await saveButton().click();
    await expect(page.getByTestId('unsaved')).toHaveCount(0);
    const saved = readFileSync(join(root, REGIONS), 'utf8');

    await freshPage(page);
    await drawRect(page, [8, 1], [12, 4]);
    confirmAnswer = false;
    await open(root);
    await expect(saveButton()).toBeDisabled();
    await expect(page.getByTestId('shape-rect')).toHaveCount(1);
    expect(
      await page.evaluate(() =>
        (
          globalThis as unknown as { regionbool: { getCurrentProject(): Promise<unknown> } }
        ).regionbool.getCurrentProject(),
      ),
    ).toBeNull();
    expect(readFileSync(join(root, REGIONS), 'utf8')).toBe(saved);
  });

  // Playwright intercepts the close prompt itself, so unsaved-prompt.spec.ts tests closing for real.
  test('asks to be warned about closing only while there are unsaved changes', async () => {
    const isGuarded = () =>
      page.evaluate(
        () => (globalThis as unknown as { onbeforeunload: unknown }).onbeforeunload !== null,
      );
    const root = createRobotProject();
    await open(root);
    expect(await isGuarded()).toBe(false);
    await drawRect(page, [2, 1], [6, 4]);
    await expect.poll(isGuarded).toBe(true);
    await saveButton().click();
    await expect.poll(isGuarded).toBe(false);
  });
});

test('an unrelated folder is rejected', async () => {
  await open(createFolder({ 'readme.txt': 'hi' }));
  await expect(page.getByTestId('project-error')).toContainText('build.gradle');
});
