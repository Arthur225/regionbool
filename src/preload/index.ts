/**
 * Preload script: the only bridge between the sandboxed renderer and the main process.
 * Expose one named method per channel, never `ipcRenderer` itself.
 */
import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannel, type RegionBoolApi } from '../shared/ipc';

const api: RegionBoolApi = {
  getAppInfo: () => ipcRenderer.invoke(IpcChannel.GetAppInfo),
  openProject: () => ipcRenderer.invoke(IpcChannel.OpenProject),
  getCurrentProject: () => ipcRenderer.invoke(IpcChannel.GetCurrentProject),
  previewExport: (project, profileId) =>
    ipcRenderer.invoke(IpcChannel.PreviewExport, project, profileId),
  writeExport: (project, profileId, expectedHash) =>
    ipcRenderer.invoke(IpcChannel.WriteExport, project, profileId, expectedHash),
  listFields: () => ipcRenderer.invoke(IpcChannel.ListFields),
  getFieldImage: (fieldId) => ipcRenderer.invoke(IpcChannel.GetFieldImage, fieldId),
};

contextBridge.exposeInMainWorld('regionbool', api);
