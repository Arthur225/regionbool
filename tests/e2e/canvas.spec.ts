/** Drives the real canvas with a real pointer, and reads results back through the UI. */
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { freshPage, launchApp } from './helpers';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  ({ app, page } = await launchApp());
});

test.afterAll(async () => {
  await app.close();
});

test.beforeEach(async () => {
  await freshPage(page);
});

/** Converts field meters to screen pixels using the SVG's own transform. */
async function toScreen(x: number, y: number): Promise<{ x: number; y: number }> {
  return page.getByTestId('field-canvas').evaluate(
    (element, [fieldX, fieldY]) => {
      const svg = element as unknown as {
        getScreenCTM(): { a: number; d: number; e: number; f: number };
        dataset: Record<string, string>;
      };
      const matrix = svg.getScreenCTM();
      const width = Number(svg.dataset['fieldWidth']);
      return { x: fieldX! * matrix.a + matrix.e, y: (width - fieldY!) * matrix.d + matrix.f };
    },
    [x, y],
  );
}

async function clickField(x: number, y: number): Promise<void> {
  const point = await toScreen(x, y);
  await page.mouse.click(point.x, point.y);
}

async function dragField(from: [number, number], to: [number, number]): Promise<void> {
  const start = await toScreen(from[0], from[1]);
  const end = await toScreen(to[0], to[1]);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2);
  await page.mouse.move(end.x, end.y);
  await page.mouse.up();
}

const tool = (name: string) =>
  page.getByRole('group', { name: 'Tools' }).getByRole('button', { name });
const value = (testId: string) => page.getByTestId(testId).inputValue();

async function drawRect(from: [number, number], to: [number, number]): Promise<void> {
  await tool('Rectangle').click();
  await dragField(from, to);
}

test('draws a rectangle in field coordinates, with y pointing up', async () => {
  await drawRect([2, 1], [6, 4]);
  await expect(page.getByTestId('region-item')).toHaveCount(1);
  await expect(page.getByTestId('method-name')).toHaveText('isInRegion1()');
  expect(await value('prop-cx')).toBe('4');
  expect(await value('prop-cy')).toBe('2.5');
  expect(await value('prop-width')).toBe('4');
  expect(await value('prop-height')).toBe('3');
  // The tool goes back to select, so the new shape can be edited right away.
  await expect(tool('Select')).toHaveAttribute('aria-pressed', 'true');
});

test('ignores a click with a drawing tool', async () => {
  await tool('Rectangle').click();
  await clickField(5, 5);
  await expect(page.getByTestId('region-item')).toHaveCount(0);
});

test('draws a circle', async () => {
  await tool('Circle').click();
  await dragField([5, 4], [8, 4]);
  expect(await value('prop-cx')).toBe('5');
  expect(await value('prop-radius')).toBe('3');
});

test('draws a triangle with 3 clicks', async () => {
  await tool('Triangle').click();
  await clickField(1, 1);
  await clickField(4, 1);
  await expect(page.getByTestId('shape-triangle')).toHaveCount(0);
  await clickField(1, 4);
  await expect(page.getByTestId('shape-triangle')).toHaveCount(1);
  await expect(page.getByTestId('shape-item')).toContainText('Triangle');
});

test.describe('polygon', () => {
  const place = async () => {
    await tool('Polygon').click();
    await clickField(2, 2);
    await page.waitForTimeout(350); // Keeps separate clicks from being read as a double-click.
    await clickField(6, 2);
    await page.waitForTimeout(350);
    await clickField(6, 6);
    await page.waitForTimeout(350);
    await clickField(2, 6);
    await page.waitForTimeout(350);
  };

  test('finishes with Enter', async () => {
    await place();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('shape-polygon')).toHaveCount(1);
    await expect(page.getByTestId('shape-properties').locator('input')).toHaveCount(8);
  });

  test('finishes by clicking the first point', async () => {
    await place();
    await clickField(2, 2);
    await expect(page.getByTestId('shape-polygon')).toHaveCount(1);
    await expect(page.getByTestId('shape-properties').locator('input')).toHaveCount(8);
  });

  test('finishes with a double-click, without adding an extra point', async () => {
    await tool('Polygon').click();
    await clickField(2, 2);
    await page.waitForTimeout(350);
    await clickField(6, 2);
    await page.waitForTimeout(350);
    const point = await toScreen(6, 6);
    await page.mouse.dblclick(point.x, point.y);
    await expect(page.getByTestId('shape-polygon')).toHaveCount(1);
    await expect(page.getByTestId('shape-properties').locator('input')).toHaveCount(6);
  });

  test('Escape cancels it', async () => {
    await place();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('shape-polygon')).toHaveCount(0);
    await expect(page.getByTestId('region-item')).toHaveCount(0);
  });

  test('double-clicking edges and points adds and removes them', async () => {
    await place();
    await page.keyboard.press('Enter');
    const inputs = page.getByTestId('shape-properties').locator('input');
    const bottomEdge = await toScreen(4, 2);
    await page.mouse.dblclick(bottomEdge.x, bottomEdge.y);
    await expect(inputs).toHaveCount(10);
    await page.waitForTimeout(350);
    const added = await toScreen(4, 2);
    await page.mouse.dblclick(added.x, added.y);
    await expect(inputs).toHaveCount(8);
  });
});

test('moves a shape by dragging, as one undo step', async () => {
  await drawRect([2, 1], [6, 4]);
  await dragField([4, 2.5], [9, 5.5]);
  expect(await value('prop-cx')).toBe('9');
  expect(await value('prop-cy')).toBe('5.5');
  await page.getByRole('button', { name: 'Undo' }).click();
  expect(await value('prop-cx')).toBe('4');
  await page.getByRole('button', { name: 'Redo' }).click();
  expect(await value('prop-cx')).toBe('9');
});

test('resizes with a corner handle, keeping the opposite corner still', async () => {
  await drawRect([2, 1], [6, 4]);
  await dragField([6, 4], [8, 6]);
  expect(await value('prop-width')).toBe('6');
  expect(await value('prop-height')).toBe('5');
  expect(await value('prop-cx')).toBe('5');
  expect(await value('prop-cy')).toBe('3.5');
});

test('resizes a circle with its handle', async () => {
  await tool('Circle').click();
  await dragField([5, 4], [7, 4]);
  await dragField([7, 4], [8, 4]);
  expect(await value('prop-radius')).toBe('3');
  expect(await value('prop-cx')).toBe('5');
});

test('rotates with the rotate handle, counterclockwise on screen for positive angles', async () => {
  await drawRect([4, 3], [8, 5]);
  const box = await page.getByTestId('rotate-handle').boundingBox();
  const handle = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
  const center = await toScreen(6, 4);
  // From straight above the center to straight left of it is a quarter turn counterclockwise.
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(center.x - 60, center.y - 60);
  await page.mouse.move(center.x - 100, center.y);
  await page.mouse.up();
  expect(await value('prop-rotation')).toBe('90');
  // Rotating about its center leaves the center alone.
  expect(await value('prop-cx')).toBe('6');
});

test('snap can be turned off for exact placement', async () => {
  await page.getByRole('checkbox', { name: 'Snap' }).uncheck();
  await drawRect([2.13, 1.13], [6.13, 4.13]);
  expect(Number(await value('prop-cx'))).toBeCloseTo(4.13, 1);
  expect(await value('prop-cx')).not.toBe('4');
  expect((await value('prop-cx')).length).toBeLessThanOrEqual(5);
});

test('numeric fields edit the shape, refuse bad values and can be undone', async () => {
  await drawRect([2, 1], [6, 4]);
  const width = page.getByTestId('prop-width');
  await width.fill('7.5');
  await width.press('Enter');
  expect(await value('prop-width')).toBe('7.5');
  await width.fill('-1');
  await width.press('Enter');
  expect(await value('prop-width')).toBe('7.5');
  await width.fill('abc');
  await width.press('Enter');
  expect(await value('prop-width')).toBe('7.5');
  await page.getByRole('button', { name: 'Undo' }).click();
  expect(await value('prop-width')).toBe('4');
});

test('keyboard shortcuts work on the canvas but not while typing', async () => {
  await page.keyboard.press('r');
  await expect(tool('Rectangle')).toHaveAttribute('aria-pressed', 'true');
  await dragField([2, 1], [6, 4]);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByTestId('shape-rect')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(page.getByTestId('shape-rect')).toHaveCount(1);

  await page.getByLabel('Region name').click();
  await page.keyboard.type('prc');
  await expect(tool('Select')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Region name')).toHaveValue('Region 1prc');
  await page.getByTestId('field-canvas').click({ position: { x: 5, y: 5 } });
  await page.locator('.shape-outline').first().click();
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('shape-rect')).toHaveCount(0);
});

test('renaming counts as one undo step and updates the method name', async () => {
  await drawRect([2, 1], [6, 4]);
  const name = page.getByLabel('Region name');
  await name.fill('Scoring Zone');
  await expect(page.getByTestId('method-name')).toHaveText('isInScoringZone()');
  await page.getByTestId('field-canvas').click({ position: { x: 5, y: 5 } });
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(name).toHaveValue('Region 1');
});

test('validation problems are shown', async () => {
  await page.getByRole('button', { name: 'Add region' }).click();
  await expect(page.getByTestId('issue-list')).toContainText('at least one shape');
});
