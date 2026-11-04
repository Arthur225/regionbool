/** Main process entry point: creates the window and applies the app's security settings. */
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { join } from 'node:path';
import { IpcChannel, type AppInfo } from '../shared/ipc';

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'RegionBool',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // The renderer shows project data, so it gets no direct access to Node or Electron.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  window.once('ready-to-show', () => window.show());

  // Links open in the user's browser, and only over https, so the app window can't be
  // navigated away from its own page.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== window.webContents.getURL()) event.preventDefault();
  });

  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  if (!app.isPackaged && devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return window;
}

function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannel.GetAppInfo, (): AppInfo => ({
    version: app.getVersion(),
    electronVersion: process.versions.electron,
  }));
}

void app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  // macOS keeps apps running with no windows and reopens one from the dock.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
