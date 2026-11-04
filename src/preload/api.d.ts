import type { RegionBoolApi } from '../shared/ipc';

declare global {
  interface Window {
    /** Provided by `src/preload/index.ts`. */
    regionbool: RegionBoolApi;
  }
}
