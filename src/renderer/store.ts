/**
 * Editor state. Undo works on snapshots of the document, which are cheap because updates never
 * mutate it. A pointer drag makes many changes but counts as one undo step, using beginGesture and
 * endGesture. Selection and tools aren't part of undo.
 */
import { create } from 'zustand';
import type { FieldDefinition } from '../shared/fields';
import type { ProjectInfo } from '../shared/ipc';
import { REGIONS_FILE_VERSION } from '../shared/model';
import type {
  AllianceMode,
  FieldInfo,
  OutputInfo,
  Point,
  Region,
  RegionProject,
  Shape,
  ShapeMode,
} from '../shared/model';

/** The active canvas tool. */
export type Tool = 'select' | 'rect' | 'circle' | 'triangle' | 'polygon';

/** Grid sizes offered for snapping, in meters. */
export const GRID_SIZES = [0.05, 0.1, 0.25, 0.5, 1] as const;

const MAX_UNDO_STEPS = 200;

/** A shape as drawn, before it has an id or mode. */
type NewShape = Shape extends infer S ? (S extends Shape ? Omit<S, 'id' | 'mode'> : never) : never;

let nextId = 1;
function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${nextId++}`;
}

/** A new document on a blank field, with a size close to recent seasons that the user can change. */
export function createEmptyDocument(): RegionProject {
  return {
    version: REGIONS_FILE_VERSION,
    field: { lengthMeters: 16.54, widthMeters: 8.07, symmetry: 'rotational' },
    output: { packageName: 'frc.robot.generated', className: 'FieldRegions' },
    regions: [],
  };
}

function nextRegionName(regions: readonly Region[]): string {
  const names = new Set(regions.map((region) => region.name));
  let number = regions.length + 1;
  while (names.has(`Region ${number}`)) number++;
  return `Region ${number}`;
}

/** A message shown across the top of the window until dismissed. */
export interface Notice {
  kind: 'info' | 'error';
  title: string;
  details: string[];
}

interface EditorState {
  doc: RegionProject;
  /** The document as last saved. There are unsaved changes when `doc` is a different object. */
  savedDoc: RegionProject;
  /** The open robot project, or null. The main process holds the same one. */
  project: ProjectInfo | null;
  notice: Notice | null;
  /** Bundled and project fields, or null until they've loaded. */
  fields: FieldDefinition[] | null;
  past: RegionProject[];
  future: RegionProject[];
  /** The document when the current drag started, or null if not dragging. */
  gestureStart: RegionProject | null;

  selectedRegionId: string | null;
  selectedShapeId: string | null;
  tool: Tool;
  /** Whether newly drawn shapes add area or cut a hole. */
  drawMode: ShapeMode;
  snapEnabled: boolean;
  gridMeters: number;
  /** Vertices placed so far while drawing a triangle or polygon. */
  draftPoints: Point[];
  /** Pointer position on the field, or null when off the canvas. */
  cursor: Point | null;

  setProject(project: ProjectInfo | null): void;
  setNotice(notice: Notice | null): void;
  setFields(fields: FieldDefinition[]): void;
  /** Records `doc` as saved, including any changes made while saving it. */
  markSaved(doc: RegionProject): void;
  setTool(tool: Tool): void;
  setDrawMode(mode: ShapeMode): void;
  setSnapEnabled(enabled: boolean): void;
  setGridMeters(meters: number): void;
  setDraftPoints(points: Point[]): void;
  setCursor(point: Point | null): void;
  select(regionId: string | null, shapeId: string | null): void;

  addRegion(): void;
  renameRegion(regionId: string, name: string): void;
  setRegionAlliance(regionId: string, mode: AllianceMode): void;
  deleteRegion(regionId: string): void;
  /** Adds a shape to the selected region, creating a region first if none is selected. */
  addShape(shape: NewShape): void;
  updateShape(shape: Shape): void;
  setShapeMode(shapeId: string, mode: ShapeMode): void;
  deleteShape(shapeId: string): void;
  setField(field: FieldInfo): void;
  setOutput(output: OutputInfo): void;

  beginGesture(): void;
  endGesture(): void;
  undo(): void;
  redo(): void;
  /** Replaces the document and clears history, treating the new document as saved. */
  reset(doc?: RegionProject): void;
}

const initialTransient = {
  past: [],
  future: [],
  gestureStart: null,
  selectedRegionId: null,
  selectedShapeId: null,
  draftPoints: [],
};

function mapShapes(doc: RegionProject, change: (shape: Shape) => Shape | null): RegionProject {
  return {
    ...doc,
    regions: doc.regions.map((region) => ({
      ...region,
      shapes: region.shapes.flatMap((shape) => change(shape) ?? []),
    })),
  };
}

/** Clears a selection that no longer exists, which can happen after undo. */
function validSelection(doc: RegionProject, regionId: string | null, shapeId: string | null) {
  const region = doc.regions.find((candidate) => candidate.id === regionId);
  if (!region) return { selectedRegionId: null, selectedShapeId: null };
  const hasShape = region.shapes.some((shape) => shape.id === shapeId);
  return { selectedRegionId: region.id, selectedShapeId: hasShape ? shapeId : null };
}

export const useEditor = create<EditorState>((set, get) => {
  /** Applies a change. During a drag, the whole drag becomes one undo step when it ends. */
  const commit = (
    change: (doc: RegionProject) => RegionProject,
    extra: Partial<EditorState> = {},
  ) => {
    const { doc, past, gestureStart } = get();
    const next = change(doc);
    if (gestureStart) {
      set({ doc: next, ...extra });
    } else {
      set({ doc: next, past: [...past, doc].slice(-MAX_UNDO_STEPS), future: [], ...extra });
    }
  };

  const emptyDocument = createEmptyDocument();
  return {
    doc: emptyDocument,
    savedDoc: emptyDocument,
    project: null,
    notice: null,
    fields: null,
    ...initialTransient,
    tool: 'select',
    drawMode: 'add',
    snapEnabled: true,
    gridMeters: 0.25,
    cursor: null,

    setProject: (project) => set({ project }),
    setNotice: (notice) => set({ notice }),
    setFields: (fields) => set({ fields }),
    markSaved: (doc) => set({ doc, savedDoc: doc }),
    setTool: (tool) => set({ tool, draftPoints: [] }),
    setDrawMode: (drawMode) => set({ drawMode }),
    setSnapEnabled: (snapEnabled) => set({ snapEnabled }),
    setGridMeters: (gridMeters) => set({ gridMeters }),
    setDraftPoints: (draftPoints) => set({ draftPoints }),
    setCursor: (cursor) => set({ cursor }),
    select: (selectedRegionId, selectedShapeId) => set({ selectedRegionId, selectedShapeId }),

    addRegion: () => {
      const id = createId('region');
      commit(
        (doc) => ({
          ...doc,
          regions: [
            ...doc.regions,
            {
              id,
              name: nextRegionName(doc.regions),
              allianceMode: 'alliance-relative',
              shapes: [],
            },
          ],
        }),
        { selectedRegionId: id, selectedShapeId: null },
      );
    },

    renameRegion: (regionId, name) =>
      commit((doc) => ({
        ...doc,
        regions: doc.regions.map((region) =>
          region.id === regionId ? { ...region, name } : region,
        ),
      })),

    setRegionAlliance: (regionId, allianceMode) =>
      commit((doc) => ({
        ...doc,
        regions: doc.regions.map((region) =>
          region.id === regionId ? { ...region, allianceMode } : region,
        ),
      })),

    deleteRegion: (regionId) => {
      const { selectedRegionId } = get();
      commit(
        (doc) => ({ ...doc, regions: doc.regions.filter((region) => region.id !== regionId) }),
        selectedRegionId === regionId ? { selectedRegionId: null, selectedShapeId: null } : {},
      );
    },

    addShape: (newShape) => {
      const { doc, selectedRegionId, drawMode } = get();
      const shape = { ...newShape, id: createId('shape'), mode: drawMode } as Shape;
      const exists = doc.regions.some((region) => region.id === selectedRegionId);
      const regionId = exists && selectedRegionId ? selectedRegionId : createId('region');
      commit(
        (current) => ({
          ...current,
          regions: exists
            ? current.regions.map((region) =>
                region.id === regionId ? { ...region, shapes: [...region.shapes, shape] } : region,
              )
            : [
                ...current.regions,
                {
                  id: regionId,
                  name: nextRegionName(current.regions),
                  allianceMode: 'alliance-relative',
                  shapes: [shape],
                },
              ],
        }),
        { selectedRegionId: regionId, selectedShapeId: shape.id },
      );
    },

    updateShape: (updated) =>
      commit((doc) => mapShapes(doc, (shape) => (shape.id === updated.id ? updated : shape))),

    setShapeMode: (shapeId, mode) =>
      commit((doc) =>
        mapShapes(doc, (shape) => (shape.id === shapeId ? { ...shape, mode } : shape)),
      ),

    deleteShape: (shapeId) => {
      const { selectedShapeId } = get();
      commit(
        (doc) => mapShapes(doc, (shape) => (shape.id === shapeId ? null : shape)),
        selectedShapeId === shapeId ? { selectedShapeId: null } : {},
      );
    },

    setField: (field) => commit((doc) => ({ ...doc, field })),
    setOutput: (output) => commit((doc) => ({ ...doc, output })),

    beginGesture: () => set((state) => ({ gestureStart: state.doc })),

    endGesture: () => {
      const { doc, past, gestureStart } = get();
      if (!gestureStart) return;
      if (doc === gestureStart) {
        set({ gestureStart: null });
      } else {
        set({
          gestureStart: null,
          past: [...past, gestureStart].slice(-MAX_UNDO_STEPS),
          future: [],
        });
      }
    },

    undo: () => {
      const { past, future, doc, selectedRegionId, selectedShapeId, gestureStart } = get();
      const previous = past.at(-1);
      if (!previous || gestureStart) return;
      set({
        doc: previous,
        past: past.slice(0, -1),
        future: [doc, ...future],
        ...validSelection(previous, selectedRegionId, selectedShapeId),
      });
    },

    redo: () => {
      const { past, future, doc, selectedRegionId, selectedShapeId, gestureStart } = get();
      const next = future[0];
      if (!next || gestureStart) return;
      set({
        doc: next,
        past: [...past, doc],
        future: future.slice(1),
        ...validSelection(next, selectedRegionId, selectedShapeId),
      });
    },

    reset: (doc = createEmptyDocument()) => set({ doc, savedDoc: doc, ...initialTransient }),
  };
});
