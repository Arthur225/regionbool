import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * Launches the app with native dialogs replaced, since a test can't drive them. The unsaved-changes
 * prompt answers "close without saving" unless a test changes it, so closing never hangs.
 */
export async function launchApp(): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({ args: ['.'] });
  await setUnsavedPromptAnswer(app, 0);
  const page = await app.firstWindow();
  await page.getByTestId('field-canvas').waitFor();
  return { app, page };
}

/** Reloads to a fresh editor, dropping unsaved work without triggering the prompt. */
export async function freshPage(page: Page): Promise<void> {
  await page.evaluate(() => {
    (globalThis as unknown as { onbeforeunload: unknown }).onbeforeunload = null;
  });
  await page.reload();
  await page.getByTestId('field-canvas').waitFor();
}

/** Sets the prompt's answer, 0 to discard or 1 to keep editing. */
export async function setUnsavedPromptAnswer(
  app: ElectronApplication,
  answer: 0 | 1,
): Promise<void> {
  await app.evaluate(({ dialog }, choice) => {
    dialog.showMessageBoxSync = (() => choice) as typeof dialog.showMessageBoxSync;
  }, answer);
}

/** Makes the next folder dialog return `path`, or be canceled if it's null. */
export async function chooseFolderInDialog(
  app: ElectronApplication,
  path: string | null,
): Promise<void> {
  await app.evaluate(({ dialog }, chosen) => {
    dialog.showOpenDialog = (() =>
      Promise.resolve({
        canceled: chosen === null,
        filePaths: chosen ? [chosen] : [],
      })) as typeof dialog.showOpenDialog;
  }, path);
}

const folders: string[] = [];

/** Creates a temporary folder holding the given files, with paths relative to it. */
export function createFolder(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'regionbool-e2e-'));
  folders.push(root);
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), contents);
  }
  return root;
}

/** Creates a robot project. Its Java file's import decides which WPILib API it appears to use. */
export function createRobotProject(extra: Record<string, string> = {}, withImports = true): string {
  return createFolder({
    'build.gradle':
      'id "edu.wpi.first.GradleRIO2027" version "2027.0.0-alpha-1"\ndef ROBOT_MAIN_CLASS = "frc.robot.Main"',
    '.wpilib/wpilib_preferences.json':
      '{"currentLanguage":"java","projectYear":"2026","teamNumber":1156}',
    ...(withImports
      ? {
          'src/main/java/frc/robot/Robot.java':
            'import edu.wpi.first.wpilibj.TimedRobot;\nclass Robot {}',
        }
      : {}),
    ...extra,
  });
}

/** Deletes every folder created so far. */
export function removeCreatedFolders(): void {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
}

/** Converts field meters to screen pixels using the SVG's own transform. */
export function toScreen(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
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

/** Drags on the field, from one position in meters to another. */
export async function dragField(
  page: Page,
  from: [number, number],
  to: [number, number],
): Promise<void> {
  const start = await toScreen(page, from[0], from[1]);
  const end = await toScreen(page, to[0], to[1]);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2);
  await page.mouse.move(end.x, end.y);
  await page.mouse.up();
}

/** Draws a rectangle with the toolbar's tool. */
export async function drawRect(
  page: Page,
  from: [number, number],
  to: [number, number],
): Promise<void> {
  await page
    .getByRole('group', { name: 'Tools' })
    .getByRole('button', { name: 'Rectangle' })
    .click();
  await dragField(page, from, to);
}
