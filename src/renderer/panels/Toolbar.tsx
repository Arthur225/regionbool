/** The top bar: project, drawing tools, add or hole mode, snapping, undo and redo. */
import type { ReactNode } from 'react';
import { openProject, saveProject } from '../actions';
import teamLogo from '../assets/team-1156-logo.png';
import { GRID_SIZES, useEditor, type Tool } from '../store';

const TOOLS: { tool: Tool; label: string; key: string; icon: ReactNode }[] = [
  { tool: 'select', label: 'Select', key: 'V', icon: <path d="M5 3l14 9-6 2-3 6z" /> },
  {
    tool: 'rect',
    label: 'Rectangle',
    key: 'R',
    icon: <rect x="4" y="6" width="16" height="12" rx="1.5" />,
  },
  { tool: 'circle', label: 'Circle', key: 'C', icon: <circle cx="12" cy="12" r="8" /> },
  { tool: 'triangle', label: 'Triangle', key: 'T', icon: <path d="M12 4l9 16H3z" /> },
  { tool: 'polygon', label: 'Polygon', key: 'P', icon: <path d="M12 3l9 7-3 11H6L3 10z" /> },
];

export function Toolbar({ onExport }: { onExport(): void }) {
  const tool = useEditor((s) => s.tool);
  const drawMode = useEditor((s) => s.drawMode);
  const snapEnabled = useEditor((s) => s.snapEnabled);
  const gridMeters = useEditor((s) => s.gridMeters);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const project = useEditor((s) => s.project);
  const dirty = useEditor((s) => s.doc !== s.savedDoc);
  const editor = useEditor.getState();
  const needsProject = project ? undefined : 'Open a robot project first';

  return (
    <header className="toolbar">
      <h1>RegionBool</h1>
      <button
        type="button"
        className="project-button"
        // The name keeps "Open robot project" for screen readers, since the visible text is just the folder.
        aria-label={project ? `${project.name}. Open robot project` : 'Open robot project'}
        title={
          project
            ? `${project.root}
Click to open a different project`
            : undefined
        }
        onClick={() => void openProject()}
      >
        {project ? project.name : 'Open robot project'}
      </button>
      <button
        type="button"
        disabled={!project || !dirty}
        title={needsProject ?? 'Save regions to the project'}
        onClick={() => void saveProject()}
      >
        Save
      </button>
      <button
        type="button"
        className="primary"
        disabled={!project}
        title={needsProject ?? 'Generate the Java class'}
        onClick={onExport}
      >
        Export Java
      </button>

      <div className="tool-group" role="group" aria-label="Tools">
        {TOOLS.map((item) => (
          <button
            key={item.tool}
            type="button"
            className={`icon-tool ${tool === item.tool ? 'active' : ''}`}
            aria-pressed={tool === item.tool}
            aria-label={item.label}
            title={`${item.label} (${item.key})`}
            onClick={() => editor.setTool(item.tool)}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              aria-hidden="true"
            >
              {item.icon}
            </svg>
          </button>
        ))}
      </div>

      <div className="tool-group" role="group" aria-label="New shapes">
        <button
          type="button"
          className={drawMode === 'add' ? 'active' : ''}
          aria-pressed={drawMode === 'add'}
          onClick={() => editor.setDrawMode('add')}
        >
          Add area
        </button>
        <button
          type="button"
          className={drawMode === 'subtract' ? 'active' : ''}
          aria-pressed={drawMode === 'subtract'}
          onClick={() => editor.setDrawMode('subtract')}
        >
          Cut hole
        </button>
      </div>

      <label className="snap-control">
        <input
          type="checkbox"
          checked={snapEnabled}
          onChange={(event) => editor.setSnapEnabled(event.target.checked)}
        />
        Snap
        <select
          aria-label="Grid size"
          value={gridMeters}
          disabled={!snapEnabled}
          onChange={(event) => editor.setGridMeters(Number(event.target.value))}
        >
          {GRID_SIZES.map((size) => (
            <option key={size} value={size}>
              {size} m
            </option>
          ))}
        </select>
      </label>

      <div className="tool-group" role="group" aria-label="History">
        <button type="button" disabled={!canUndo} onClick={() => editor.undo()}>
          Undo
        </button>
        <button type="button" disabled={!canRedo} onClick={() => editor.redo()}>
          Redo
        </button>
      </div>
      <img className="team-logo" src={teamLogo} alt="Team 1156" />
    </header>
  );
}
