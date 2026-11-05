import { beforeEach, describe, expect, it } from 'vitest';
import { useEditor } from '../../src/renderer/store';
import type { Shape } from '../../src/shared/model';

const editor = () => useEditor.getState();
const rect = { kind: 'rect', cx: 1, cy: 1, width: 1, height: 1, rotationDeg: 0 } as const;
const firstShape = (): Shape => editor().doc.regions[0]!.shapes[0]!;

beforeEach(() => {
  editor().reset();
  editor().setDrawMode('add');
});

describe('adding shapes', () => {
  it('creates a region when none is selected, as one undo step', () => {
    editor().addShape(rect);
    expect(editor().doc.regions).toHaveLength(1);
    expect(editor().doc.regions[0]!.name).toBe('Region 1');
    expect(editor().selectedShapeId).toBe(firstShape().id);
    editor().undo();
    expect(editor().doc.regions).toHaveLength(0);
  });

  it('adds to the selected region, using the current mode', () => {
    editor().addShape(rect);
    editor().setDrawMode('subtract');
    editor().addShape({ ...rect, cx: 5 });
    const { shapes } = editor().doc.regions[0]!;
    expect(shapes.map((shape) => shape.mode)).toEqual(['add', 'subtract']);
    expect(new Set(shapes.map((shape) => shape.id)).size).toBe(2);
  });

  it('does not reuse a region name', () => {
    editor().addRegion();
    editor().addRegion();
    editor().deleteRegion(editor().doc.regions[0]!.id);
    editor().addRegion();
    const names = editor().doc.regions.map((region) => region.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('undo and redo', () => {
  it('walks back and forward', () => {
    editor().addShape(rect);
    editor().renameRegion(editor().doc.regions[0]!.id, 'Zone');
    editor().undo();
    expect(editor().doc.regions[0]!.name).toBe('Region 1');
    editor().redo();
    expect(editor().doc.regions[0]!.name).toBe('Zone');
  });

  it('clears redo after a new change', () => {
    editor().addShape(rect);
    editor().undo();
    editor().addShape(rect);
    expect(editor().future).toHaveLength(0);
  });

  it('does nothing when there is nothing to do', () => {
    const before = editor().doc;
    editor().undo();
    editor().redo();
    expect(editor().doc).toBe(before);
  });

  it('clears a selection that undo removed', () => {
    editor().addShape(rect);
    editor().undo();
    expect(editor().selectedRegionId).toBeNull();
    expect(editor().selectedShapeId).toBeNull();
  });

  it('limits how much history it keeps', () => {
    editor().addRegion();
    const id = editor().doc.regions[0]!.id;
    for (let i = 0; i < 250; i++) editor().renameRegion(id, `Name ${i}`);
    expect(editor().past.length).toBe(200);
  });
});

describe('gestures', () => {
  it('turns a whole drag into one undo step', () => {
    editor().addShape(rect);
    const start = firstShape();
    editor().beginGesture();
    for (let i = 1; i <= 5; i++) editor().updateShape({ ...start, cx: i } as Shape);
    editor().endGesture();
    expect(firstShape()).toMatchObject({ cx: 5 });
    editor().undo();
    expect(firstShape()).toMatchObject({ cx: 1 });
    editor().redo();
    expect(firstShape()).toMatchObject({ cx: 5 });
  });

  it('adds no undo step when nothing changed', () => {
    editor().addShape(rect);
    const steps = editor().past.length;
    editor().beginGesture();
    editor().endGesture();
    expect(editor().past).toHaveLength(steps);
  });

  it('blocks undo during a drag', () => {
    editor().addShape(rect);
    editor().beginGesture();
    editor().updateShape({ ...firstShape(), cx: 9 } as Shape);
    editor().undo();
    expect(firstShape()).toMatchObject({ cx: 9 });
    editor().endGesture();
  });
});

describe('deleting', () => {
  it('clears the selection of a deleted shape', () => {
    editor().addShape(rect);
    editor().deleteShape(firstShape().id);
    expect(editor().selectedShapeId).toBeNull();
    expect(editor().doc.regions[0]!.shapes).toHaveLength(0);
  });

  it('clears the selection of a deleted region', () => {
    editor().addShape(rect);
    editor().deleteRegion(editor().doc.regions[0]!.id);
    expect(editor().selectedRegionId).toBeNull();
  });
});

describe('unsaved changes', () => {
  const dirty = () => editor().doc !== editor().savedDoc;

  it('starts clean, and changes make it dirty', () => {
    expect(dirty()).toBe(false);
    editor().addShape(rect);
    expect(dirty()).toBe(true);
  });

  it('is clean again after saving', () => {
    editor().addShape(rect);
    editor().markSaved(editor().doc);
    expect(dirty()).toBe(false);
  });

  it('is clean again after undoing back to the saved version', () => {
    editor().addShape(rect);
    editor().markSaved(editor().doc);
    editor().renameRegion(editor().doc.regions[0]!.id, 'Zone');
    expect(dirty()).toBe(true);
    editor().undo();
    expect(dirty()).toBe(false);
  });

  it('treats a loaded document as saved', () => {
    editor().addShape(rect);
    editor().reset();
    expect(dirty()).toBe(false);
  });
});

describe('tools', () => {
  it('discards a half-drawn shape when changing tools', () => {
    editor().setTool('polygon');
    editor().setDraftPoints([{ x: 1, y: 1 }]);
    editor().setTool('select');
    expect(editor().draftPoints).toEqual([]);
  });
});
