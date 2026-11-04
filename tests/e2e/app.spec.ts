import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

let app: ElectronApplication;

test.beforeAll(async () => {
  app = await electron.launch({ args: ['.'] });
});

test.afterAll(async () => {
  await app.close();
});

test('the window loads and reaches the main process through the bridge', async () => {
  const window = await app.firstWindow();
  await expect(window.getByRole('heading', { name: 'RegionBool' })).toBeVisible();
  await expect(window.getByTestId('app-version')).toContainText('Version');
});

test('the renderer has no direct access to Node or IPC', async () => {
  const window = await app.firstWindow();
  const exposed = await window.evaluate(() => ({
    require: typeof (globalThis as Record<string, unknown>)['require'],
    process: typeof (globalThis as Record<string, unknown>)['process'],
    bridgeKeys: Object.keys((globalThis as unknown as { regionbool: object }).regionbool),
  }));
  expect(exposed.require).toBe('undefined');
  expect(exposed.process).toBe('undefined');
  expect(exposed.bridgeKeys).toEqual(['getAppInfo']);
});

test('the window is configured with the expected security settings', async () => {
  const prefs = await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) throw new Error('No window');
    // Not in Electron's public types, but it's the only way to read back the applied settings.
    const contents = window.webContents as unknown as { getLastWebPreferences(): object };
    return contents.getLastWebPreferences();
  });
  expect(prefs).toMatchObject({ contextIsolation: true, nodeIntegration: false, sandbox: true });
});
