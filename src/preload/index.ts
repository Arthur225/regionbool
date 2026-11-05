/**
 * Preload script: the only bridge between the sandboxed renderer and the main process.
 * Expose one named method per channel, never `ipcRenderer` itself.
 */
import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannel, type RegionBoolApi } from '../shared/ipc';

const api: RegionBoolApi = {
  getAppInfo: () => ipcRenderer.invoke(IpcChannel.GetAppInfo),
  openProject: () => ipcRenderer.invoke(IpcChannel.OpenProject),
  closeProject: () => ipcRenderer.invoke(IpcChannel.CloseProject),
  saveRegions: (project) => ipcRenderer.invoke(IpcChannel.SaveRegions, project),
  getCurrentProject: () => ipcRenderer.invoke(IpcChannel.GetCurrentProject),
  previewExport: (project, profileId) =>
    ipcRenderer.invoke(IpcChannel.PreviewExport, project, profileId),
  writeExport: (project, profileId, expectedHash) =>
    ipcRenderer.invoke(IpcChannel.WriteExport, project, profileId, expectedHash),
  listFields: () => ipcRenderer.invoke(IpcChannel.ListFields),
  getFieldImage: (fieldId) => ipcRenderer.invoke(IpcChannel.GetFieldImage, fieldId),
  pickFieldImage: () => ipcRenderer.invoke(IpcChannel.PickFieldImage),
  saveCustomField: (spec) => ipcRenderer.invoke(IpcChannel.SaveCustomField, spec),
};

contextBridge.exposeInMainWorld('regionbool', api);
