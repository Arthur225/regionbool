/** Actions that involve both the main process and the editor state. */
import type { FieldDefinition } from '../shared/fields';
import type { FieldInfo, OutputInfo, RegionProject } from '../shared/model';
import { createEmptyDocument, useEditor } from './store';

/** The field settings for a definition. One with no symmetry keeps the current setting. */
export function fieldInfoFrom(definition: FieldDefinition, current: FieldInfo): FieldInfo {
  return {
    lengthMeters: definition.lengthMeters,
    widthMeters: definition.widthMeters,
    symmetry: definition.symmetry ?? current.symmetry,
    fieldId: definition.id,
  };
}

/** A new document on the newest available field. */
function blankDocument(output?: OutputInfo): RegionProject {
  const empty = createEmptyDocument();
  const newest = useEditor.getState().fields?.[0];
  return {
    ...empty,
    ...(newest && { field: fieldInfoFrom(newest, empty.field) }),
    ...(output && { output }),
  };
}

/** Reloads the field list, which changes when a project opens or a field is imported. */
export async function refreshFields(): Promise<void> {
  const fields = await window.regionbool.listFields();
  const editor = useEditor.getState();
  const firstLoad = editor.fields === null;
  editor.setFields(fields);
  // Start on the newest field, unless the user has already begun.
  if (firstLoad && editor.doc === editor.savedDoc && editor.doc.regions.length === 0) {
    editor.reset({ ...blankDocument(), output: editor.doc.output });
  }
}

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
    editor.reset(blankDocument(output));
  }

  editor.setProject(project);
  await refreshFields();
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
