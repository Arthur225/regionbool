/** The top bar: project, drawing tools, add or hole mode, snapping, undo and redo. */
import type { OpenProjectResult } from '../../shared/ipc';
import { GRID_SIZES, useEditor, type Tool } from '../store';

const TOOLS: { tool: Tool; label: string; key: string }[] = [
  { tool: 'select', label: 'Select', key: 'V' },
  { tool: 'rect', label: 'Rectangle', key: 'R' },
  { tool: 'circle', label: 'Circle', key: 'C' },
  { tool: 'triangle', label: 'Triangle', key: 'T' },
  { tool: 'polygon', label: 'Polygon', key: 'P' },
  { tool: 'test', label: 'Test point', key: 'X' },
];

export function Toolbar({ onProjectResult }: { onProjectResult(result: OpenProjectResult): void }) {
  const tool = useEditor((s) => s.tool);
  const drawMode = useEditor((s) => s.drawMode);
  const snapEnabled = useEditor((s) => s.snapEnabled);
  const gridMeters = useEditor((s) => s.gridMeters);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const editor = useEditor.getState();

  return (
    <header className="toolbar">
      <h1>RegionBool</h1>
      <button
        type="button"
        onClick={() => void window.regionbool.openProject().then(onProjectResult)}
      >
        Open robot project
      </button>

      <div className="tool-group" role="group" aria-label="Tools">
        {TOOLS.map((item) => (
          <button
            key={item.tool}
            type="button"
            className={tool === item.tool ? 'active' : ''}
            aria-pressed={tool === item.tool}
            title={`${item.label} (${item.key})`}
            onClick={() => editor.setTool(item.tool)}
          >
            {item.label}
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
    </header>
  );
}
