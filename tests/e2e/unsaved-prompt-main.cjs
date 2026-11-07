/**
 * Runs the real app without Playwright, whose debugger connection intercepts the close prompt.
 * Makes an edit, tries to close the window, answers the prompt, and prints what happened.
 */
const { app, BrowserWindow, dialog } = require('electron');
const { join } = require('node:path');

const answers = [1, 0]; // Keep editing, then close without saving.
let prompts = 0;
dialog.showMessageBoxSync = () => {
  prompts++;
  return answers.shift();
};

// The app's own main process. Leaving this script's folder as the app path doesn't affect closing.
require(join(__dirname, '../../out/main/index.js'));

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Waits for a condition rather than a fixed time, because CI machines can be very slow. */
async function waitUntil(check, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await pause(50);
  }
  return false;
}

app.whenReady().then(async () => {
  await waitUntil(() => BrowserWindow.getAllWindows().length > 0);
  const window = BrowserWindow.getAllWindows()[0];
  if (window.webContents.isLoading()) {
    await new Promise((resolve) => window.webContents.once('did-finish-load', resolve));
  }
  const run = (code) => window.webContents.executeJavaScript(code);

  // Make a real edit, so the app itself asks to be warned. It clears the handler while starting up,
  // so setting it from here would be a race.
  await waitUntil(() => run(`!!document.querySelector('[data-fields-loaded="true"]')`));
  await run(
    `[...document.querySelectorAll('button')].find((b) => b.textContent === 'Add region').click(); 0`,
  );
  const guarded = await waitUntil(() => run('window.onbeforeunload !== null'));
  console.log(`guarded=${guarded}`);

  // Chromium only honors beforeunload after the page has seen a user gesture, so click until
  // the page reports that it has.
  const activated = await waitUntil(async () => {
    window.webContents.sendInputEvent({
      type: 'mouseDown',
      x: 5,
      y: 5,
      button: 'left',
      clickCount: 1,
    });
    window.webContents.sendInputEvent({
      type: 'mouseUp',
      x: 5,
      y: 5,
      button: 'left',
      clickCount: 1,
    });
    await pause(100);
    return run('navigator.userActivation.hasBeenActive');
  });
  console.log(`activated=${activated}`);

  window.close();
  await waitUntil(() => prompts >= 1 || window.isDestroyed());
  await pause(200); // Lets a window that's about to close finish doing so.
  console.log(`after-keep-editing prompts=${prompts} open=${!window.isDestroyed()}`);
  if (window.isDestroyed()) app.exit(1);

  window.once('closed', () => {
    console.log(`after-discard prompts=${prompts}`);
    app.exit(0);
  });
  window.close();
  setTimeout(() => {
    console.log(`timed-out prompts=${prompts}`);
    app.exit(1);
  }, 10_000);
});
