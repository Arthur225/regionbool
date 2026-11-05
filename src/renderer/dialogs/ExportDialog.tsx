/** Shows exactly what export would change, and writes it only when the user approves. */
import { useEffect, useMemo, useState } from 'react';
import type { ExportPreviewResult, ExportWriteResult } from '../../shared/ipc';
import { JAVA_PROFILES, type JavaProfileId } from '../../shared/javaProfiles';
import { collapseDiff, lineDiff } from '../../shared/lineDiff';
import { toMethodName } from '../../shared/model';
import { useEditor } from '../store';

const PROFILE_IDS = Object.keys(JAVA_PROFILES) as JavaProfileId[];

export function ExportDialog({ onClose }: { onClose(): void }) {
  const project = useEditor((s) => s.project);
  const doc = useEditor((s) => s.doc);
  const detection = project?.profile;

  // A weak guess isn't preselected, so that generating code for it is a deliberate choice.
  const [profileId, setProfileId] = useState<JavaProfileId | null>(
    doc.output.javaProfile ?? (detection?.confident ? detection.id : null),
  );
  const [preview, setPreview] = useState<ExportPreviewResult | null>(null);
  const [written, setWritten] = useState<Extract<ExportWriteResult, { ok: true }> | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);

  const finalDoc = useMemo(
    () => (profileId ? { ...doc, output: { ...doc.output, javaProfile: profileId } } : doc),
    [doc, profileId],
  );

  useEffect(() => {
    if (!profileId) return;
    let current = true;
    void window.regionbool.previewExport(finalDoc, profileId).then((result) => {
      if (current) setPreview(result);
    });
    return () => {
      current = false;
    };
  }, [finalDoc, profileId]);

  const rows = useMemo(
    () => (preview?.ok ? collapseDiff(lineDiff(preview.existing ?? '', preview.generated)) : []),
    [preview],
  );

  async function write() {
    if (!preview?.ok || !profileId) return;
    const result = await window.regionbool.writeExport(finalDoc, profileId, preview.existingHash);
    if (result.ok) {
      useEditor.getState().markSaved(finalDoc);
      setWritten(result);
      setWriteError(null);
    } else {
      setWriteError(result.message);
    }
  }

  const firstMethod = doc.regions[0] ? toMethodName(doc.regions[0].name) : null;
  const canWrite = preview?.ok === true && preview.status !== 'not-generated';

  return (
    <div className="dialog-backdrop">
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Export Java"
        data-testid="export-dialog"
      >
        <h2>Export Java</h2>

        {written ? (
          <>
            <p data-testid="export-success">
              Wrote <code>{written.relativePath}</code> and saved{' '}
              <code>.regionbool/regions.json</code>. Commit both, so your team gets the code and can
              keep editing the regions.
            </p>
            {firstMethod && (
              <div className="usage">
                <code>
                  {doc.output.className}.{firstMethod}(pose)
                </code>
                <br />
                <code>{doc.output.className}.publishTo(field2d)</code>
              </div>
            )}
          </>
        ) : (
          <>
            <label className="inline-field">
              WPILib API
              <select
                aria-label="WPILib API"
                value={profileId ?? ''}
                onChange={(event) => {
                  setPreview(null);
                  setProfileId(event.target.value as JavaProfileId);
                }}
              >
                {!profileId && <option value="">Choose one</option>}
                {PROFILE_IDS.map((id) => (
                  <option key={id} value={id}>
                    {JAVA_PROFILES[id].label}
                  </option>
                ))}
              </select>
            </label>

            {!profileId && (
              <p className="dialog-warning" data-testid="profile-needed">
                {detection?.id
                  ? `This project's imports don't clearly show which WPILib API it uses. It looks like ${detection.id}, so please confirm.`
                  : 'This project has no imports showing which WPILib API it uses, so please choose one.'}
              </p>
            )}

            {preview && !preview.ok && (
              <div className="dialog-error" data-testid="export-problems">
                <p>The code can&apos;t be generated yet:</p>
                <ul>
                  {preview.issues.length > 0 ? (
                    preview.issues.map((issue, index) => <li key={index}>{issue.message}</li>)
                  ) : (
                    <li>{preview.message}</li>
                  )}
                </ul>
              </div>
            )}

            {preview?.ok && (
              <>
                <p data-testid="export-status">
                  <code>{preview.relativePath}</code>{' '}
                  {preview.status === 'new' && 'will be created.'}
                  {preview.status === 'update' && 'will be replaced with these changes.'}
                  {preview.status === 'unchanged' && 'is already up to date.'}
                  {preview.status === 'not-generated' && 'already exists.'}
                </p>
                {preview.status === 'not-generated' && (
                  <p className="dialog-error" data-testid="export-blocked">
                    RegionBool didn&apos;t generate that file, so it won&apos;t replace it. Choose a
                    different class name or package, or move the file.
                  </p>
                )}
                {preview.handEdited && (
                  <p className="dialog-warning" data-testid="export-hand-edited">
                    This file was edited after the last export. Writing will lose those edits, shown
                    in red below.
                  </p>
                )}
                {preview.status !== 'unchanged' && preview.status !== 'not-generated' && (
                  <pre className="diff" data-testid="export-diff">
                    {rows.map((row, index) =>
                      row.type === 'gap' ? (
                        <div key={index} className="gap">
                          ⋯ {row.hidden} unchanged lines
                        </div>
                      ) : (
                        <div key={index} className={row.type}>
                          {row.type === 'add' ? '+ ' : row.type === 'remove' ? '- ' : '  '}
                          {row.text}
                        </div>
                      ),
                    )}
                  </pre>
                )}
              </>
            )}

            {writeError && (
              <p className="dialog-error" role="alert" data-testid="export-error">
                {writeError}
              </p>
            )}
          </>
        )}

        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            {written ? 'Done' : 'Cancel'}
          </button>
          {!written && (
            <button
              type="button"
              className="primary"
              disabled={!canWrite}
              onClick={() => void write()}
            >
              {preview?.ok && preview.handEdited ? 'Replace edited file' : 'Write file'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
