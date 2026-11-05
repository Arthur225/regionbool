/**
 * Runs the real app without Playwright, whose debugger connection intercepts the close prompt.
 * Blocks closing the way the renderer does, answers the prompt, and prints what happened.
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

app.whenReady().then(async () => {
  await new Promise((resolve) => setTimeout(resolve, 500));
  const window = BrowserWindow.getAllWindows()[0];
  await window.webContents.executeJavaScript('window.onbeforeunload = () => true; 0');
  // Chromium only honors beforeunload after the page has seen a user gesture.
  await window.webContents.executeJavaScript('0', true);
  window.webContents.sendInputEvent({
    type: 'mouseDown',
    x: 5,
    y: 5,
    button: 'left',
    clickCount: 1,
  });
  window.webContents.sendInputEvent({ type: 'mouseUp', x: 5, y: 5, button: 'left', clickCount: 1 });
  await new Promise((resolve) => setTimeout(resolve, 200));

  window.close();
  await new Promise((resolve) => setTimeout(resolve, 500));
  console.log(`after-keep-editing prompts=${prompts} open=${!window.isDestroyed()}`);

  window.once('closed', () => {
    console.log(`after-discard prompts=${prompts}`);
    app.exit(0);
  });
  window.close();
  setTimeout(() => {
    console.log(`timed-out prompts=${prompts}`);
    app.exit(1);
  }, 3000);
});
