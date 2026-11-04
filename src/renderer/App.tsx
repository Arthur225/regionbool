/** Root component. For now it's a placeholder that proves the IPC bridge works. */
import { useEffect, useState } from 'react';
import type { AppInfo } from '../shared/ipc';

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    void window.regionbool.getAppInfo().then(setInfo);
  }, []);

  return (
    <main className="placeholder">
      <h1>RegionBool</h1>
      <p>Draw FRC field regions and generate boolean Java methods.</p>
      {info && <p data-testid="app-version">Version {info.version}</p>}
    </main>
  );
}
