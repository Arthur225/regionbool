/** The left panel: regions, the shapes in the selected one, and validation problems. */
import { useMemo } from 'react';
import { toMethodName, validateProject } from '../../shared/model';
import type { Shape } from '../../shared/model';
import { regionColor } from '../canvas/FieldCanvas';
import { useEditor } from '../store';

const SHAPE_LABELS: Record<Shape['kind'], string> = {
  rect: 'Rectangle',
  circle: 'Circle',
  triangle: 'Triangle',
  polygon: 'Polygon',
};

export function RegionPanel() {
  const doc = useEditor((s) => s.doc);
  const selectedRegionId = useEditor((s) => s.selectedRegionId);
  const selectedShapeId = useEditor((s) => s.selectedShapeId);
  const editor = useEditor.getState();
  const issues = useMemo(() => validateProject(doc), [doc]);

  return (
    <aside className="panel region-panel" aria-label="Regions">
      <div className="panel-heading">
        <h2>Regions</h2>
        <button type="button" onClick={() => editor.addRegion()}>
          Add region
        </button>
      </div>

      {doc.regions.length === 0 && (
        <p className="hint">
          Pick a shape tool above and draw on the field. A region is created for you.
        </p>
      )}

      <ul className="region-list">
        {doc.regions.map((region, index) => {
          const selected = region.id === selectedRegionId;
          const method = toMethodName(region.name);
          return (
            <li key={region.id} className={selected ? 'selected' : ''} data-testid="region-item">
              <div className="region-header" onClick={() => editor.select(region.id, null)}>
                <span className="swatch" style={{ background: regionColor(index) }} />
                <input
                  aria-label="Region name"
                  value={region.name}
                  onFocus={() => {
                    editor.select(region.id, selectedShapeId);
                    // One rename is one undo step, however many keys it takes.
                    editor.beginGesture();
                  }}
                  onBlur={() => editor.endGesture()}
                  onChange={(event) => editor.renameRegion(region.id, event.target.value)}
                />
                <button
                  type="button"
                  className="icon"
                  aria-label={`Delete ${region.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    editor.deleteRegion(region.id);
                  }}
                >
                  ×
                </button>
              </div>
              <code className="method-name" data-testid="method-name">
                {method ? `${method}()` : 'Needs a name'}
              </code>

              {selected && (
                <>
                  <label className="inline-field">
                    Alliance
                    <select
                      aria-label="Alliance behavior"
                      value={region.allianceMode}
                      onChange={(event) =>
                        editor.setRegionAlliance(
                          region.id,
                          event.target.value as typeof region.allianceMode,
                        )
                      }
                    >
                      <option value="alliance-relative">Flips on red</option>
                      <option value="fixed">Fixed on field</option>
                    </select>
                  </label>
                  <ul className="shape-list">
                    {region.shapes.map((shape) => (
                      <li
                        key={shape.id}
                        className={shape.id === selectedShapeId ? 'selected' : ''}
                        data-testid="shape-item"
                        onClick={() => editor.select(region.id, shape.id)}
                      >
                        <span>{SHAPE_LABELS[shape.kind]}</span>
                        <select
                          aria-label="Shape mode"
                          value={shape.mode}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) =>
                            editor.setShapeMode(shape.id, event.target.value as Shape['mode'])
                          }
                        >
                          <option value="add">Adds area</option>
                          <option value="subtract">Cuts hole</option>
                        </select>
                        <button
                          type="button"
                          className="icon"
                          aria-label={`Delete ${SHAPE_LABELS[shape.kind]}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            editor.deleteShape(shape.id);
                          }}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </li>
          );
        })}
      </ul>

      {issues.length > 0 && (
        <ul className="issue-list" data-testid="issue-list">
          {issues.map((issue, index) => (
            <li key={index} className={issue.severity}>
              {issue.message}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
