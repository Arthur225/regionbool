/** Reopening the last project when the app starts, across real restarts of the app. */
import { readFileSync, renameSync } from 'node:fs';
import { basename, join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import {
  chooseFolderInDialog,
  createFolder,
  createRobotProject,
  drawRect,
  freshPage,
  launchApp,
  removeCreatedFolders,
} from './helpers';

test.afterAll(removeCreatedFolders);

const projectButton = (page: Page) => page.getByRole('button', { name: 'Open robot project' });

async function openAndSaveRegion(
  app: ElectronApplication,
  page: Page,
  root: string,
): Promise<void> {
  await chooseFolderInDialog(app, root);
  await projectButton(page).click();
  await expect(projectButton(page)).toHaveText(basename(root));
  await drawRect(page, [2, 1], [6, 4]);
  await page.getByLabel('Region name').fill('Saved Zone');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByTestId('unsaved')).toHaveCount(0);
}

test('tests do not use the real settings folder', async () => {
  const dir = createFolder({});
  const { app } = await launchApp(undefined, dir);
  expect(await app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'))).toContain(
    basename(dir),
  );
  await app.close();
});

test('starts with no project the first time', async () => {
  const { app, page } = await launchApp();
  await expect(projectButton(page)).toHaveText('Open robot project');
  await app.close();
});

test('reopens the last project and its regions after a restart', async () => {
  const settings = createFolder({});
  const root = createRobotProject();
  const first = await launchApp(undefined, settings);
  await openAndSaveRegion(first.app, first.page, root);
  await first.app.close();
  expect(
    JSON.parse(readFileSync(join(settings, 'settings.json'), 'utf8')).lastProjectPath,
  ).toContain(basename(root));

  const second = await launchApp(undefined, settings);
  await expect(projectButton(second.page)).toHaveText(basename(root));
  await expect(second.page.getByLabel('Region name')).toHaveValue('Saved Zone');
  await expect(second.page.getByTestId('unsaved')).toHaveCount(0);
  await expect(second.page.getByRole('button', { name: 'Export Java' })).toBeEnabled();
  await second.app.close();
});

test('remembers the most recent of several projects', async () => {
  const settings = createFolder({});
  const [one, two] = [createRobotProject(), createRobotProject()];
  const first = await launchApp(undefined, settings);
  await chooseFolderInDialog(first.app, one);
  await projectButton(first.page).click();
  await expect(projectButton(first.page)).toHaveText(basename(one));
  await chooseFolderInDialog(first.app, two);
  await projectButton(first.page).click();
  await expect(projectButton(first.page)).toHaveText(basename(two));
  await first.app.close();

  const second = await launchApp(undefined, settings);
  await expect(projectButton(second.page)).toHaveText(basename(two));
  await second.app.close();
});

test('a folder that is not a project is not remembered', async () => {
  const settings = createFolder({});
  const root = createRobotProject();
  const first = await launchApp(undefined, settings);
  await chooseFolderInDialog(first.app, root);
  await projectButton(first.page).click();
  await expect(projectButton(first.page)).toHaveText(basename(root));
  await chooseFolderInDialog(first.app, createFolder({ 'readme.txt': 'hi' }));
  await projectButton(first.page).click();
  await expect(first.page.getByTestId('project-error')).toBeVisible();
  await first.app.close();

  const second = await launchApp(undefined, settings);
  await expect(projectButton(second.page)).toHaveText(basename(root));
  await second.app.close();
});

test('a project that was moved is forgotten quietly', async () => {
  const settings = createFolder({});
  const root = createRobotProject();
  const first = await launchApp(undefined, settings);
  await chooseFolderInDialog(first.app, root);
  await projectButton(first.page).click();
  await expect(projectButton(first.page)).toHaveText(basename(root));
  await first.app.close();

  renameSync(root, `${root}-moved`);
  const second = await launchApp(undefined, settings);
  await expect(projectButton(second.page)).toHaveText('Open robot project');
  await expect(second.page.getByTestId('project-error')).toHaveCount(0);
  await second.app.close();
  expect(
    JSON.parse(readFileSync(join(settings, 'settings.json'), 'utf8')).lastProjectPath,
  ).toBeNull();
  renameSync(`${root}-moved`, root);
});

test('reloading the page still starts empty, so it cannot save over a project', async () => {
  const settings = createFolder({});
  const root = createRobotProject();
  const first = await launchApp(undefined, settings);
  await openAndSaveRegion(first.app, first.page, root);
  await freshPage(first.page);
  await first.page.waitForTimeout(300);
  await expect(projectButton(first.page)).toHaveText('Open robot project');
  await expect(first.page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await first.app.close();
});
