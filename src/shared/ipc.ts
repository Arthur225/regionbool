/**
 * The complete IPC contract between the main process and the renderer.
 *
 * Every channel is declared here so both sides share one definition, and so this
 * file lists everything the sandboxed renderer is able to ask for.
 */

/** Names of all IPC channels. */
export const IpcChannel = {
  /** Returns {@link AppInfo}. Takes no arguments and has no side effects. */
  GetAppInfo: 'app:get-info',
} as const;

/** Basic facts about the running app, used by the UI and to confirm the IPC bridge works. */
export interface AppInfo {
  /** App version from package.json, such as `0.1.0`. */
  version: string;
  /** Electron runtime version. */
  electronVersion: string;
}

/** The API the preload script exposes to the renderer as `window.regionbool`. */
export interface RegionBoolApi {
  getAppInfo(): Promise<AppInfo>;
}
