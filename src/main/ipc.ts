/**
 * IPC handlers: the main process side of the contract in `src/shared/ipc.ts`.
 *
 * This module holds the current project. The renderer can't name a folder, only ask the user to
 * pick one, and it can't reach any file outside that project.
 */
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { join } from 'node:path';
import type { FieldDefinition } from '../shared/fields';
import {
  IpcChannel,
  type AppInfo,
  type ExportPreviewResult,
  type ExportWriteResult,
  type OpenProjectResult,
  type ProjectInfo,
  type SaveResult,
} from '../shared/ipc';
import { previewExport, writeExport } from './export';
import { getFieldImage, listFields } from './fields';
import { detectProject } from './project';
import { readSavedRegions, saveRegions } from './regionsFile';

let currentProject: ProjectInfo | null = null;

/** Runs an export step for the current project, reporting any failure as a normal result. */
async function withProject<T>(
  run: (root: string) => Promise<T>,
): Promise<T | { ok: false; message: string; issues: [] }> {
  if (!currentProject) return { ok: false, message: 'No project is open.', issues: [] };
  try {
    return await run(currentProject.root);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message, issues: [] };
  }
}

/** Bundled field folder. Packaged apps keep it in the resources folder (build step 7). */
function bundledFieldsDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'fields')
    : join(app.getAppPath(), 'resources/fields');
}

/** Field folders in priority order, lowest first. */
function fieldDirs(): string[] {
  const dirs = [bundledFieldsDir()];
  if (currentProject) dirs.push(join(currentProject.root, '.regionbool/fields'));
  return dirs;
}

/** Registers every IPC handler. Call once, after the app is ready. */
export function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannel.GetAppInfo, (): AppInfo => ({
    version: app.getVersion(),
    electronVersion: process.versions.electron,
  }));

  ipcMain.handle(IpcChannel.OpenProject, async (event): Promise<OpenProjectResult> => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: 'Open a WPILib Java project',
      properties: ['openDirectory'] as ['openDirectory'],
    };
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    const path = result.filePaths[0];
    if (result.canceled || !path) return { status: 'canceled' };

    const detection = await detectProject(path);
    if (!detection.valid) return { status: 'invalid', path, reasons: detection.reasons };
    currentProject = detection.project;
    return {
      status: 'opened',
      project: detection.project,
      saved: await readSavedRegions(detection.project.root),
    };
  });

  ipcMain.handle(IpcChannel.CloseProject, () => {
    currentProject = null;
  });

  ipcMain.handle(IpcChannel.SaveRegions, (_event, data: unknown): Promise<SaveResult> =>
    withProject((root) => saveRegions(root, data)),
  );

  ipcMain.handle(IpcChannel.GetCurrentProject, (): ProjectInfo | null => currentProject);

  ipcMain.handle(
    IpcChannel.PreviewExport,
    (_event, data: unknown, profileId: unknown): Promise<ExportPreviewResult> =>
      withProject((root) => previewExport(root, data, profileId)),
  );

  ipcMain.handle(
    IpcChannel.WriteExport,
    (
      _event,
      data: unknown,
      profileId: unknown,
      expectedHash: unknown,
    ): Promise<ExportWriteResult> =>
      withProject((root) => writeExport(root, data, profileId, expectedHash)),
  );

  ipcMain.handle(IpcChannel.ListFields, (): Promise<FieldDefinition[]> => listFields(fieldDirs()));

  ipcMain.handle(IpcChannel.GetFieldImage, (_event, id: unknown): Promise<string | null> => {
    return typeof id === 'string' ? getFieldImage(fieldDirs(), id) : Promise.resolve(null);
  });
}
