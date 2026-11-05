/** Actions that involve both the main process and the editor state. */
import { createEmptyDocument, useEditor } from './store';

/** Moves focus out of the current field, so its pending value is committed first. */
function commitFocusedField(): void {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}

/** Saves regions to the open project. Does nothing without one. */
export async function saveProject(): Promise<void> {
  const editor = useEditor.getState();
  if (!editor.project) return;
  commitFocusedField();
  const { doc } = useEditor.getState();
  const result = await window.regionbool.saveRegions(doc);
  if (result.ok) {
    useEditor.getState().markSaved(doc);
    useEditor.getState().setNotice(null);
  } else {
    useEditor
      .getState()
      .setNotice({ kind: 'error', title: 'Save failed.', details: [result.message] });
  }
}

/**
 * Asks the user to pick a project and loads it. Work is only discarded after a confirmation:
 * regions drawn before any project was open carry over into a project with nothing saved.
 */
export async function openProject(): Promise<void> {
  const before = useEditor.getState();
  const dirty = before.doc !== before.savedDoc;
  if (
    before.project &&
    dirty &&
    !window.confirm(`Unsaved changes to ${before.project.name} will be lost. Open another project?`)
  ) {
    return;
  }

  const result = await window.regionbool.openProject();
  const editor = useEditor.getState();
  if (result.status === 'canceled') return;
  if (result.status === 'invalid') {
    editor.setNotice({
      kind: 'error',
      title: "That folder isn't a WPILib Java project.",
      details: result.reasons,
    });
    return;
  }

  const { project, saved } = result;
  const output = { packageName: project.defaultPackageName, className: 'FieldRegions' };

  if (saved.status === 'loaded') {
    if (
      !before.project &&
      dirty &&
      !window.confirm(`Replace your drawing with the regions saved in ${project.name}?`)
    ) {
      // Stay out of the project: saving now would overwrite its regions with this drawing.
      await window.regionbool.closeProject();
      editor.setProject(null);
      return;
    }
    editor.reset(saved.project);
  } else if (!before.project && dirty) {
    editor.setOutput(output);
  } else {
    editor.reset({ ...createEmptyDocument(), output });
  }

  editor.setProject(project);
  editor.setNotice(
    saved.status === 'invalid'
      ? {
          kind: 'error',
          title: `.regionbool/regions.json in ${project.name} couldn't be read.`,
          details: [
            saved.message,
            'Saving and exporting will be refused until it is fixed or removed.',
          ],
        }
      : null,
  );
}
