/** Root component: lays out the editor and handles keyboard shortcuts. */
import { useEffect, useState } from 'react';
import type { AppInfo, OpenProjectResult, ProjectInfo } from '../shared/ipc';
import { FieldCanvas } from './canvas/FieldCanvas';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { RegionPanel } from './panels/RegionPanel';
import { Toolbar } from './panels/Toolbar';
import { useEditor, type Tool } from './store';

const TOOL_KEYS: Record<string, Tool> = {
  v: 'select',
  r: 'rect',
  c: 'circle',
  t: 'triangle',
  p: 'polygon',
  x: 'test',
};

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement
  );
}

function handleKey(event: KeyboardEvent): void {
  // Text fields keep their own undo and shortcuts.
  if (isTyping(event.target)) return;
  const editor = useEditor.getState();
  const key = event.key.toLowerCase();

  if ((event.metaKey || event.ctrlKey) && key === 'z') {
    event.preventDefault();
    if (event.shiftKey) editor.redo();
    else editor.undo();
    return;
  }
  if ((event.metaKey || event.ctrlKey) && key === 'y') {
    event.preventDefault();
    editor.redo();
    return;
  }
  if (event.metaKey || event.ctrlKey || event.altKey) return;

  if (key === 'escape') {
    editor.setTool('select');
  } else if (key === 'enter' && editor.tool === 'polygon' && editor.draftPoints.length >= 3) {
    editor.addShape({ kind: 'polygon', points: editor.draftPoints });
    editor.setTool('select');
  } else if ((key === 'delete' || key === 'backspace') && editor.selectedShapeId) {
    editor.deleteShape(editor.selectedShapeId);
  } else if (TOOL_KEYS[key]) {
    editor.setTool(TOOL_KEYS[key]);
  }
}

function StatusBar({ info }: { info: AppInfo | null }) {
  const cursor = useEditor((s) => s.cursor);
  const tool = useEditor((s) => s.tool);
  const draftCount = useEditor((s) => s.draftPoints.length);

  const hints: Partial<Record<Tool, string>> = {
    rect: 'Drag to draw a rectangle.',
    circle: 'Drag from the center to draw a circle.',
    triangle: `Click 3 points. ${draftCount} placed.`,
    polygon: `Click to place points, then double-click, press Enter, or click the first point to finish. ${draftCount} placed.`,
    test: 'Click the field to test a point.',
  };

  return (
    <footer className="status-bar">
      <span data-testid="cursor-position">
        {cursor ? `x ${cursor.x.toFixed(2)} m, y ${cursor.y.toFixed(2)} m` : 'Off the field map'}
      </span>
      <span className="status-hint">{hints[tool] ?? ''}</span>
      {info && <span data-testid="app-version">Version {info.version}</span>}
    </footer>
  );
}

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [problem, setProblem] = useState<Extract<OpenProjectResult, { status: 'invalid' }> | null>(
    null,
  );

  useEffect(() => {
    void window.regionbool.getAppInfo().then(setInfo);
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  function onProjectResult(result: OpenProjectResult) {
    if (result.status === 'opened') {
      setProject(result.project);
      setProblem(null);
    } else if (result.status === 'invalid') {
      setProblem(result);
    }
  }

  return (
    <div className="app">
      <Toolbar onProjectResult={onProjectResult} />
      {problem && (
        <div className="banner" role="alert" data-testid="project-error">
          <div>
            <strong>That folder isn&apos;t a WPILib Java project.</strong>
            <ul>
              {problem.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
          <button type="button" onClick={() => setProblem(null)}>
            Dismiss
          </button>
        </div>
      )}
      <div className="workspace">
        <RegionPanel />
        <main className="canvas-area">
          <FieldCanvas />
        </main>
        <PropertiesPanel project={project} />
      </div>
      <StatusBar info={info} />
    </div>
  );
}
