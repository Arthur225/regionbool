/** Choosing a field, and importing your own image. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import {
  chooseFolderInDialog,
  createFolder,
  createPng,
  createRobotProject,
  dragField,
  drawRect,
  freshPage,
  launchApp,
  removeCreatedFolders,
} from './helpers';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  ({ app, page } = await launchApp());
  page.on('dialog', (dialog) => {
    if (dialog.type() !== 'beforeunload') void dialog.accept();
  });
});

test.afterAll(async () => {
  await app.close();
  removeCreatedFolders();
});

test.beforeEach(async () => {
  await freshPage(page);
});

const picker = () => page.getByLabel('Field', { exact: true });
const image = () => page.getByTestId('field-image');
const numberValue = (testId: string) => page.getByTestId(testId).inputValue();

async function openProject(root: string): Promise<void> {
  await chooseFolderInDialog(app, root);
  await page.getByRole('button', { name: 'Open robot project' }).click();
  await expect(page.getByTestId('project-details')).toContainText(basename(root));
}

async function pickImage(path: string): Promise<void> {
  await chooseFolderInDialog(app, path);
  await page.getByRole('button', { name: 'Import field image' }).click();
}

test('starts on the newest field with its image, and nothing to save', async () => {
  await expect(picker()).toHaveValue('2026-rebuilt-welded');
  await expect(image()).toBeAttached();
  expect(await numberValue('field-length')).toBe('16.541');
  expect(await numberValue('field-width')).toBe('8.069');
  await expect(page.getByTestId('unsaved')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
});

test('lists every bundled season, with the welded and AndyMark variants', async () => {
  const labels = await picker().locator('option').allTextContents();
  expect(labels).toEqual([
    'Blank grid (custom size)',
    '2026 Rebuilt (welded field)',
    '2026 Rebuilt (AndyMark field)',
    '2025 Reefscape (welded field)',
    '2025 Reefscape (AndyMark field)',
    '2024 Crescendo',
    '2023 Charged Up',
    '2022 Rapid React',
  ]);
});

test('choosing a field sets its size and symmetry, and can be undone', async () => {
  await picker().selectOption('2024-crescendo');
  expect(await numberValue('field-width')).toBe('8.211');
  await expect(page.getByLabel('Field symmetry')).toHaveValue('mirrored');
  await expect(image()).toBeAttached();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(picker()).toHaveValue('2026-rebuilt-welded');
  await expect(page.getByLabel('Field symmetry')).toHaveValue('rotational');
});

test('places the image so its field corners land on the field corners', async () => {
  await picker().selectOption('2025-reefscape-welded');
  await expect(image()).toBeAttached();
  const placement = await image().evaluate((element) => ({
    transform: element.getAttribute('transform'),
    x: Number(element.getAttribute('x')),
    y: Number(element.getAttribute('y')),
    width: Number(element.getAttribute('width')),
    height: Number(element.getAttribute('height')),
  }));
  // The 2025 image is 4000 x 1927, with the field from (534, 289) to (3466, 1636).
  const metersPerPixelX = 17.548 / (3466 - 534);
  const metersPerPixelY = 8.052 / (1636 - 289);
  expect(placement.x + 534 * metersPerPixelX).toBeCloseTo(0, 6);
  expect(placement.y + 289 * metersPerPixelY).toBeCloseTo(0, 6);
  expect(placement.width).toBeCloseTo(4000 * metersPerPixelX, 6);
  expect(placement.height).toBeCloseTo(1927 * metersPerPixelY, 6);
  // This image shows red on the left, so it's turned about the center of the field.
  expect(placement.transform).toBe(`rotate(180 ${17.548 / 2} ${8.052 / 2})`);
});

test('the blank grid and custom sizes have no image', async () => {
  await picker().selectOption('');
  await expect(image()).toHaveCount(0);

  await picker().selectOption('2024-crescendo');
  await expect(image()).toBeAttached();
  const length = page.getByTestId('field-length');
  await length.fill('20');
  await length.press('Enter');
  await expect(picker()).toHaveValue('');
  await expect(image()).toHaveCount(0);
});

test('drawing still works over an image', async () => {
  await drawRect(page, [2, 1], [6, 4]);
  expect(await numberValue('prop-cx')).toBe('4');
  await dragField(page, [4, 2.5], [5, 2.5]);
  expect(await numberValue('prop-cx')).toBe('5');
});

test('the open button shows the project name once one is open', async () => {
  const button = page.getByRole('button', { name: 'Open robot project' });
  await expect(button).toHaveText('Open robot project');
  const root = createRobotProject();
  await openProject(root);
  await expect(button).toHaveText(basename(root));
  await expect(button).toHaveAttribute('title', new RegExp('open a different project'));

  // It still opens another project.
  const other = createRobotProject();
  await openProject(other);
  await expect(button).toHaveText(basename(other));
});

test('the chosen field is saved with the project', async () => {
  const root = createRobotProject();
  await openProject(root);
  await picker().selectOption('2023-chargedup');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByTestId('unsaved')).toHaveCount(0);
  const saved = JSON.parse(readFileSync(join(root, '.regionbool/regions.json'), 'utf8'));
  expect(saved.field).toMatchObject({ fieldId: '2023-chargedup', symmetry: 'mirrored' });

  await freshPage(page);
  await openProject(root);
  await expect(picker()).toHaveValue('2023-chargedup');
});

test('a saved field that no longer exists falls back to a grid at the saved size', async () => {
  const root = createRobotProject();
  await openProject(root);
  await drawRect(page, [2, 1], [6, 4]);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByTestId('unsaved')).toHaveCount(0);
  const path = join(root, '.regionbool/regions.json');
  const saved = JSON.parse(readFileSync(path, 'utf8'));
  saved.field = { lengthMeters: 12, widthMeters: 6, symmetry: 'mirrored', fieldId: 'gone-field' };
  writeFileSync(path, JSON.stringify(saved));

  await freshPage(page);
  await openProject(root);
  expect(await numberValue('field-length')).toBe('12');
  await expect(picker()).toHaveValue('');
  await expect(image()).toHaveCount(0);
});

test.describe('importing an image', () => {
  const importButton = () =>
    page.getByTestId('import-dialog').getByRole('button', { name: 'Import' });

  /** Clicks a position in the displayed image, as a fraction of its size. */
  async function clickImage(fractionX: number, fractionY: number): Promise<void> {
    const box = await page.getByTestId('import-image').boundingBox();
    await page.mouse.click(box!.x + box!.width * fractionX, box!.y + box!.height * fractionY);
  }

  test('needs a project', async () => {
    await expect(page.getByRole('button', { name: 'Import field image' })).toBeDisabled();
  });

  test('canceling the file dialog does nothing', async () => {
    await openProject(createRobotProject());
    await chooseFolderInDialog(app, null);
    await page.getByRole('button', { name: 'Import field image' }).click();
    await expect(page.getByTestId('import-dialog')).toHaveCount(0);
  });

  test('a file that is not an image is refused', async () => {
    await openProject(createRobotProject());
    const folder = createFolder({ 'fake.png': 'not an image' });
    await pickImage(join(folder, 'fake.png'));
    await expect(page.getByTestId('project-error')).toContainText("isn't a PNG or JPEG");
    await expect(page.getByTestId('import-dialog')).toHaveCount(0);
  });

  test('imports an image into the project and uses it, with corners in image pixels', async () => {
    const root = createRobotProject();
    await openProject(root);
    const folder = createFolder({});
    writeFileSync(join(folder, 'practice-field.png'), createPng(800, 400));
    await pickImage(join(folder, 'practice-field.png'));

    await expect(page.getByTestId('import-name')).toHaveValue('practice-field');
    await expect(importButton()).toBeDisabled();

    // Clicking bottom right first shows corners work in either order.
    await clickImage(0.75, 0.75);
    await expect(importButton()).toBeDisabled();
    await clickImage(0.25, 0.25);
    await expect(importButton()).toBeEnabled();

    const length = page.getByTestId('import-length');
    await length.fill('12');
    await length.press('Enter');
    const width = page.getByTestId('import-width');
    await width.fill('6');
    await width.press('Enter');
    await page.getByLabel('Imported field symmetry').selectOption('mirrored');
    await page.getByTestId('import-red-on-left').check();
    await importButton().click();

    await expect(page.getByTestId('import-dialog')).toHaveCount(0);
    await expect(picker()).toHaveValue('practice-field');
    expect(await numberValue('field-length')).toBe('12');
    await expect(page.getByLabel('Field symmetry')).toHaveValue('mirrored');
    await expect(image()).toBeAttached();

    const dir = join(root, '.regionbool/fields');
    expect(existsSync(join(dir, 'practice-field.png'))).toBe(true);
    const definition = JSON.parse(readFileSync(join(dir, 'practice-field.json'), 'utf8'));
    // A screen pixel may not line up exactly with an image pixel, so allow for rounding.
    const { 'top-left': topLeft, 'bottom-right': bottomRight } = definition['field-corners'];
    for (const [actual, expected] of [
      [topLeft[0], 200],
      [topLeft[1], 100],
      [bottomRight[0], 600],
      [bottomRight[1], 300],
    ]) {
      expect(Math.abs(actual - expected)).toBeLessThanOrEqual(2);
    }
    expect(definition['field-size']).toEqual([12, 6]);
    expect(definition['image-rotated']).toBe(true);
    await expect(image()).toHaveAttribute('transform', 'rotate(180 6 3)');

    // It's still there for the next session, because it's part of the project.
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('unsaved')).toHaveCount(0);
    await freshPage(page);
    await openProject(root);
    await expect(picker()).toHaveValue('practice-field');
    await expect(image()).toBeAttached();
  });

  test('a third click starts the corners over', async () => {
    await openProject(createRobotProject());
    const folder = createFolder({});
    writeFileSync(join(folder, 'f.png'), createPng(400, 200));
    await pickImage(join(folder, 'f.png'));
    await clickImage(0.1, 0.1);
    await clickImage(0.9, 0.9);
    await expect(importButton()).toBeEnabled();
    await clickImage(0.5, 0.5);
    await expect(importButton()).toBeDisabled();
    await page.getByTestId('import-dialog').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByTestId('import-dialog')).toHaveCount(0);
  });

  test('the main process refuses to import when no image was picked', async () => {
    await openProject(createRobotProject());
    const result = await page.evaluate(() =>
      (
        globalThis as unknown as {
          regionbool: { saveCustomField(spec: object): Promise<{ ok: boolean }> };
        }
      ).regionbool.saveCustomField({
        name: 'x',
        lengthMeters: 1,
        widthMeters: 1,
        symmetry: 'mirrored',
        topLeftPixel: [0, 0],
        bottomRightPixel: [1, 1],
      }),
    );
    expect(result.ok).toBe(false);
  });
});
