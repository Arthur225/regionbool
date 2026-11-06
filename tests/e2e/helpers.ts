import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * Launches the app with native dialogs replaced, since a test can't drive them. The unsaved-changes
 * prompt answers "close without saving" unless a test changes it, so closing never hangs.
 */
export async function launchApp(
  executablePath?: string,
): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch(
    executablePath ? { executablePath, args: [] } : { args: ['.'] },
  );
  await setUnsavedPromptAnswer(app, 0);
  const page = await app.firstWindow();
  await waitForEditor(page);
  return { app, page };
}

/** Waits for the editor, including the initial field, which replaces the empty document. */
export async function waitForEditor(page: Page): Promise<void> {
  await page.locator('[data-testid="field-canvas"][data-fields-loaded="true"]').waitFor();
}

/** Reloads to a fresh editor, dropping unsaved work without triggering the prompt. */
export async function freshPage(page: Page): Promise<void> {
  await page.evaluate(() => {
    (globalThis as unknown as { onbeforeunload: unknown }).onbeforeunload = null;
  });
  await page.reload();
  await waitForEditor(page);
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

/** Builds a real solid-color PNG, so tests can import an image of a known size. */
export function createPng(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // 8 bits per channel
  header[9] = 2; // RGB
  const row = Buffer.alloc(1 + width * 3, 0x60);
  row[0] = 0;
  const pixels = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
