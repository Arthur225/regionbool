/** Root component: lays out the editor and handles keyboard shortcuts. */
import { useEffect, useState } from 'react';
import type { AppInfo } from '../shared/ipc';
import { refreshFields, saveProject } from './actions';
import { FieldCanvas } from './canvas/FieldCanvas';
import { ExportDialog } from './dialogs/ExportDialog';
import { FieldImportDialog } from './dialogs/FieldImportDialog';
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
};

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement
  );
}

function handleKey(event: KeyboardEvent): void {
  // A dialog blocks everything behind it.
  if (document.querySelector('[role="dialog"]')) return;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    void saveProject();
    return;
  }
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
  const dirty = useEditor((s) => s.doc !== s.savedDoc);

  const hints: Partial<Record<Tool, string>> = {
    rect: 'Drag to draw a rectangle.',
    circle: 'Drag from the center to draw a circle.',
    triangle: `Click 3 points. ${draftCount} placed.`,
    polygon: `Click to place points, then double-click, press Enter, or click the first point to finish. ${draftCount} placed.`,
  };

  return (
    <footer className="status-bar">
      <span data-testid="cursor-position">
        {cursor ? `x ${cursor.x.toFixed(2)} m, y ${cursor.y.toFixed(2)} m` : 'Off the field map'}
      </span>
      <span className="status-hint">{hints[tool] ?? ''}</span>
      {dirty && (
        <span className="dirty-state" data-testid="unsaved">
          Unsaved changes
        </span>
      )}
      {info && <span data-testid="app-version">Version {info.version}</span>}
    </footer>
  );
}

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importImage, setImportImage] = useState<{ fileName: string; dataUrl: string } | null>(
    null,
  );
  const notice = useEditor((s) => s.notice);
  const dirty = useEditor((s) => s.doc !== s.savedDoc);
  const projectName = useEditor((s) => s.project?.name);

  useEffect(() => {
    void window.regionbool.getAppInfo().then(setInfo);
    // A reloaded page starts empty, so the main process must not keep a project it would save over.
    void window.regionbool.closeProject().then(refreshFields);
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // Closing with unsaved changes makes the main process ask first.
  useEffect(() => {
    window.onbeforeunload = dirty ? () => true : null;
    document.title = `${dirty ? '• ' : ''}${projectName ? `${projectName} - ` : ''}RegionBool`;
  }, [dirty, projectName]);

  async function chooseImage() {
    const result = await window.regionbool.pickFieldImage();
    if (result.status === 'picked') {
      setImportImage(result);
    } else if (result.status === 'invalid') {
      useEditor.getState().setNotice({
        kind: 'error',
        title: "That image can't be used.",
        details: [result.message],
      });
    }
  }

  return (
    <div className="app">
      <Toolbar onExport={() => setExporting(true)} />
      {notice && (
        <div className={`banner ${notice.kind}`} role="alert" data-testid="project-error">
          <div>
            <strong>{notice.title}</strong>
            <ul>
              {notice.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          </div>
          <button type="button" onClick={() => useEditor.getState().setNotice(null)}>
            Dismiss
          </button>
        </div>
      )}
      <div className="workspace">
        <RegionPanel />
        <main className="canvas-area">
          <FieldCanvas />
        </main>
        <PropertiesPanel onImportField={() => void chooseImage()} />
      </div>
      <StatusBar info={info} />
      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
      {importImage && (
        <FieldImportDialog image={importImage} onClose={() => setImportImage(null)} />
      )}
    </div>
  );
}
