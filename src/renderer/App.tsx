/**
 * Root component. For now it's a small page for opening a project and seeing what was detected.
 * The field canvas replaces it in build step 4.
 */
import { useEffect, useState } from 'react';
import type { AppInfo, OpenProjectResult, ProjectInfo } from '../shared/ipc';
import { JAVA_PROFILES } from '../shared/javaProfiles';

function profileLabel(project: ProjectInfo): string {
  const { id, confident, source } = project.profile;
  if (!id) return 'Could not be determined';
  const label = JAVA_PROFILES[id].label;
  const basis = source === 'imports' ? 'from the project imports' : 'from GradleRIO';
  return `${label}, ${basis}${confident ? '' : ' (needs confirming)'}`;
}

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [result, setResult] = useState<OpenProjectResult | null>(null);

  useEffect(() => {
    void window.regionbool.getAppInfo().then(setInfo);
  }, []);

  return (
    <main className="placeholder">
      <h1>RegionBool</h1>
      <p>Draw FRC field regions and generate boolean Java methods.</p>
      {info && <p data-testid="app-version">Version {info.version}</p>}

      <button type="button" onClick={() => void window.regionbool.openProject().then(setResult)}>
        Open robot project
      </button>

      {result?.status === 'opened' && (
        <dl data-testid="project-details">
          <dt>Project</dt>
          <dd>{result.project.name}</dd>
          <dt>GradleRIO</dt>
          <dd>{result.project.gradleRioVersion ?? 'Unknown'}</dd>
          <dt>WPILib API</dt>
          <dd>{profileLabel(result.project)}</dd>
          <dt>Generated package</dt>
          <dd>{result.project.defaultPackageName}</dd>
        </dl>
      )}
      {result?.status === 'invalid' && (
        <div role="alert" data-testid="project-error">
          <p>That folder isn&apos;t a WPILib Java project:</p>
          <ul>
            {result.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
