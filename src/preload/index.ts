/**
 * Preload script: the only bridge between the sandboxed renderer and the main process.
 * Expose one named method per channel, never `ipcRenderer` itself.
 */
import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannel, type RegionBoolApi } from '../shared/ipc';

const api: RegionBoolApi = {
  getAppInfo: () => ipcRenderer.invoke(IpcChannel.GetAppInfo),
};

contextBridge.exposeInMainWorld('regionbool', api);
