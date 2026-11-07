/** Main process entry point: creates the window and applies the app's security settings. */
import { app, BrowserWindow, dialog, shell } from 'electron';
import { join } from 'node:path';
import { registerIpcHandlers } from './ipc';

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

  // The renderer blocks closing while there are unsaved changes, and Electron leaves asking to us.
  window.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(window, {
      type: 'warning',
      message: 'You have unsaved changes.',
      detail: 'Your regions will be lost if you close without saving.',
      buttons: ['Close without saving', 'Keep editing'],
      defaultId: 1,
      cancelId: 1,
    });
    if (choice === 0) event.preventDefault();
  });

  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  if (!app.isPackaged && devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return window;
}

void app.whenReady().then(() => {
  // Packaged apps get their icon from electron-builder. Without this, development shows Electron's.
  if (!app.isPackaged) {
    try {
      app.dock?.setIcon(join(app.getAppPath(), 'build/icon.png'));
    } catch {
      // Only cosmetic, so it must never stop the app from starting.
    }
  }
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
