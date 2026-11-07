/** The right panel: exact values for the selected shape, the field's settings and the project. */
import type { ProjectInfo } from '../../shared/ipc';
import { JAVA_PROFILES } from '../../shared/javaProfiles';
import type { FieldInfo, FieldSymmetry, PolygonShape, Shape } from '../../shared/model';
import { fieldInfoFrom } from '../actions';
import { useEditor } from '../store';
import { NumberField } from './NumberField';

/** Removes the field definition, because a custom size wouldn't match its image. */
function customSize(field: FieldInfo): FieldInfo {
  return {
    lengthMeters: field.lengthMeters,
    widthMeters: field.widthMeters,
    symmetry: field.symmetry,
  };
}

function profileLabel(project: ProjectInfo): string {
  const { id, confident, source } = project.profile;
  if (!id) return 'Could not be determined';
  const label = JAVA_PROFILES[id].label;
  const basis = source === 'imports' ? 'from the project imports' : 'from GradleRIO';
  return `${label}, ${basis}${confident ? '' : ' (needs confirming)'}`;
}

function VertexFields({ shape, update }: { shape: PolygonShape; update(shape: Shape): void }) {
  return (
    <>
      {shape.points.map((point, index) => (
        <div className="field-row" key={index}>
          <NumberField
            label={`P${index + 1} x`}
            unit="m"
            value={point.x}
            onCommit={(x) =>
              update({
                ...shape,
                points: shape.points.map((p, i) => (i === index ? { ...p, x } : p)),
              })
            }
          />
          <NumberField
            label="y"
            unit="m"
            value={point.y}
            onCommit={(y) =>
              update({
                ...shape,
                points: shape.points.map((p, i) => (i === index ? { ...p, y } : p)),
              })
            }
          />
        </div>
      ))}
      {shape.kind === 'polygon' && (
        <p className="hint">Double-click an edge to add a point, or a point to remove it.</p>
      )}
    </>
  );
}

function ShapeFields({ shape }: { shape: Shape }) {
  const update = useEditor.getState().updateShape;
  switch (shape.kind) {
    case 'rect':
      return (
        <>
          <p className="field-caption">Center</p>
          <div className="field-row">
            <NumberField
              label="x"
              unit="m"
              testId="prop-cx"
              value={shape.cx}
              onCommit={(cx) => update({ ...shape, cx })}
            />
            <NumberField
              label="y"
              unit="m"
              testId="prop-cy"
              value={shape.cy}
              onCommit={(cy) => update({ ...shape, cy })}
            />
          </div>
          <div className="field-row">
            <NumberField
              label="Width"
              unit="m"
              min={0}
              testId="prop-width"
              value={shape.width}
              onCommit={(width) => update({ ...shape, width })}
            />
            <NumberField
              label="Height"
              unit="m"
              min={0}
              testId="prop-height"
              value={shape.height}
              onCommit={(height) => update({ ...shape, height })}
            />
          </div>
          <NumberField
            label="Rotation"
            unit="°"
            testId="prop-rotation"
            value={shape.rotationDeg}
            onCommit={(rotationDeg) => update({ ...shape, rotationDeg })}
          />
        </>
      );
    case 'circle':
      return (
        <>
          <p className="field-caption">Center</p>
          <div className="field-row">
            <NumberField
              label="x"
              unit="m"
              testId="prop-cx"
              value={shape.cx}
              onCommit={(cx) => update({ ...shape, cx })}
            />
            <NumberField
              label="y"
              unit="m"
              testId="prop-cy"
              value={shape.cy}
              onCommit={(cy) => update({ ...shape, cy })}
            />
          </div>
          <NumberField
            label="Radius"
            unit="m"
            min={0}
            testId="prop-radius"
            value={shape.radius}
            onCommit={(radius) => update({ ...shape, radius })}
          />
        </>
      );
    case 'triangle':
    case 'polygon':
      return <VertexFields shape={shape} update={update} />;
  }
}

export function PropertiesPanel({ onImportField }: { onImportField(): void }) {
  const doc = useEditor((s) => s.doc);
  const project = useEditor((s) => s.project);
  const fields = useEditor((s) => s.fields);
  const selectedRegionId = useEditor((s) => s.selectedRegionId);
  const selectedShapeId = useEditor((s) => s.selectedShapeId);
  const { field } = doc;
  const editor = useEditor.getState();

  const region = doc.regions.find((candidate) => candidate.id === selectedRegionId);
  const shape = region?.shapes.find((candidate) => candidate.id === selectedShapeId);

  return (
    <aside className="panel properties-panel" aria-label="Properties">
      {shape && (
        <section data-testid="shape-properties">
          <h2>Shape</h2>
          {/* Keyed so that selecting another shape starts with its own values. */}
          <ShapeFields key={shape.id} shape={shape} />
        </section>
      )}

      <section>
        <h2>Field</h2>
        <select
          className="field-picker"
          aria-label="Field"
          value={fields?.some((f) => f.id === field.fieldId) ? field.fieldId : ''}
          onChange={(event) => {
            const definition = fields?.find((f) => f.id === event.target.value);
            if (definition) {
              editor.setField(fieldInfoFrom(definition, field));
            } else {
              editor.setField(customSize(field));
            }
          }}
        >
          <option value="">Blank grid (custom size)</option>
          {fields?.map((definition) => (
            <option key={definition.id} value={definition.id}>
              {definition.game}
            </option>
          ))}
        </select>
        <div className="field-row">
          <NumberField
            label="Length"
            unit="m"
            min={0}
            testId="field-length"
            value={field.lengthMeters}
            onCommit={(lengthMeters) => editor.setField({ ...customSize(field), lengthMeters })}
          />
          <NumberField
            label="Width"
            unit="m"
            min={0}
            testId="field-width"
            value={field.widthMeters}
            onCommit={(widthMeters) => editor.setField({ ...customSize(field), widthMeters })}
          />
        </div>
        <label className="inline-field">
          Red side
          <select
            aria-label="Field symmetry"
            value={field.symmetry}
            onChange={(event) =>
              editor.setField({ ...field, symmetry: event.target.value as FieldSymmetry })
            }
          >
            <option value="rotational">Rotated 180°</option>
            <option value="mirrored">Mirrored</option>
          </select>
        </label>
        <button
          type="button"
          className="full-width"
          disabled={!project}
          title={
            project ? 'Use your own field image in this project' : 'Open a robot project first'
          }
          onClick={onImportField}
        >
          Import field image
        </button>
      </section>

      {project && (
        <section>
          <h2>Project</h2>
          <dl data-testid="project-details">
            <dt>Name</dt>
            <dd>{project.name}</dd>
            <dt>GradleRIO</dt>
            <dd>{project.gradleRioVersion ?? 'Unknown'}</dd>
            <dt>WPILib API</dt>
            <dd>{profileLabel(project)}</dd>
          </dl>
          <h2 className="subheading">Generated class</h2>
          <label className="text-field">
            Package
            <input
              data-testid="output-package"
              value={doc.output.packageName}
              onFocus={() => editor.beginGesture()}
              onBlur={() => editor.endGesture()}
              onChange={(event) =>
                editor.setOutput({ ...doc.output, packageName: event.target.value })
              }
            />
          </label>
          <label className="text-field">
            Class
            <input
              data-testid="output-class"
              value={doc.output.className}
              onFocus={() => editor.beginGesture()}
              onBlur={() => editor.endGesture()}
              onChange={(event) =>
                editor.setOutput({ ...doc.output, className: event.target.value })
              }
            />
          </label>
        </section>
      )}
    </aside>
  );
}
