import { describe, expect, it } from 'vitest';
import { shapeContains } from '../../src/shared/geometry';
import type { CircleShape, FieldInfo, PolygonShape, RectShape } from '../../src/shared/model';
import {
  circleFromDrag,
  clampToField,
  insertVertex,
  moveVertex,
  rectCorners,
  rectFromDrag,
  removeVertex,
  resizeCircle,
  resizeRectCorner,
  rotateShape,
  roundMeters,
  shapeCenter,
  snapPoint,
  snapValue,
  translateShape,
} from '../../src/shared/shapeOps';

const rect: RectShape = {
  id: 's',
  mode: 'add',
  kind: 'rect',
  cx: 5,
  cy: 4,
  width: 4,
  height: 2,
  rotationDeg: 0,
};
const circle: CircleShape = { id: 's', mode: 'add', kind: 'circle', cx: 2, cy: 2, radius: 1 };
const polygon: PolygonShape = {
  id: 's',
  mode: 'add',
  kind: 'polygon',
  points: [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 4 },
    { x: 0, y: 4 },
  ],
};
const triangle: PolygonShape = { ...polygon, kind: 'triangle', points: polygon.points.slice(0, 3) };

describe('snapping', () => {
  it('rounds to millimeters without a grid', () => {
    expect(roundMeters(1.23456)).toBe(1.235);
    expect(snapValue(1.23456, null)).toBe(1.235);
    expect(Object.is(roundMeters(-0.0001), 0)).toBe(true);
  });

  it('snaps to the grid without floating-point noise', () => {
    expect(snapValue(1.13, 0.25)).toBe(1.25);
    expect(snapValue(0.34, 0.1)).toBe(0.3);
    expect(snapPoint({ x: 0.31, y: 0.69 }, 0.05)).toEqual({ x: 0.3, y: 0.7 });
  });

  it('clamps to the field', () => {
    const field: FieldInfo = { lengthMeters: 10, widthMeters: 5, symmetry: 'mirrored' };
    expect(clampToField({ x: -1, y: 9 }, field)).toEqual({ x: 0, y: 5 });
  });
});

describe('drawing', () => {
  it('makes the same rectangle from a drag in any direction', () => {
    const expected = { kind: 'rect', cx: 2, cy: 3, width: 2, height: 2, rotationDeg: 0 };
    expect(rectFromDrag({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual(expected);
    expect(rectFromDrag({ x: 3, y: 4 }, { x: 1, y: 2 })).toEqual(expected);
    expect(rectFromDrag({ x: 3, y: 2 }, { x: 1, y: 4 })).toEqual(expected);
  });

  it('ignores accidental clicks', () => {
    expect(rectFromDrag({ x: 1, y: 1 }, { x: 1, y: 1 })).toBeNull();
    expect(rectFromDrag({ x: 1, y: 1 }, { x: 5, y: 1.01 })).toBeNull();
    expect(circleFromDrag({ x: 1, y: 1 }, { x: 1.01, y: 1 })).toBeNull();
  });

  it('makes a circle from its center and edge', () => {
    expect(circleFromDrag({ x: 1, y: 1 }, { x: 4, y: 5 })).toEqual({
      kind: 'circle',
      cx: 1,
      cy: 1,
      radius: 5,
    });
  });
});

describe('rectangles', () => {
  it('computes corners', () => {
    expect(rectCorners(rect)).toEqual([
      { x: 7, y: 5 },
      { x: 7, y: 3 },
      { x: 3, y: 3 },
      { x: 3, y: 5 },
    ]);
  });

  it('has corners that the containment test agrees are on the edge', () => {
    const rotated = { ...rect, rotationDeg: 37 };
    for (const corner of rectCorners(rotated)) {
      expect(shapeContains(rotated, corner.x, corner.y)).toBe(true);
    }
  });

  it('keeps the opposite corner still when resizing, even when rotated', () => {
    for (const rotationDeg of [0, 30, 90, -20]) {
      const start = { ...rect, rotationDeg };
      const fixed = rectCorners(start)[2]!;
      const resized = resizeRectCorner(start, 0, { x: fixed.x + 3, y: fixed.y + 3 });
      expect(resized.rotationDeg).toBe(rotationDeg);
      // Dragging past the fixed corner can swap which corner it is, so look for it among all four.
      const closest = Math.min(
        ...rectCorners(resized).map((corner) => Math.hypot(corner.x - fixed.x, corner.y - fixed.y)),
      );
      expect(closest).toBeLessThan(0.002);
    }
  });

  it('never resizes to nothing', () => {
    const resized = resizeRectCorner(rect, 0, rectCorners(rect)[2]!);
    expect(resized.width).toBeGreaterThan(0);
    expect(resized.height).toBeGreaterThan(0);
  });
});

describe('transforms', () => {
  it('moves every shape kind', () => {
    expect(translateShape(rect, 1, -1)).toMatchObject({ cx: 6, cy: 3 });
    expect(translateShape(circle, 1, -1)).toMatchObject({ cx: 3, cy: 1 });
    expect(translateShape(triangle, 1, -1).points[1]).toEqual({ x: 5, y: -1 });
  });

  it('does not change the original', () => {
    const copy = structuredClone(polygon);
    translateShape(polygon, 1, 1);
    rotateShape(polygon, 45);
    moveVertex(polygon, 0, { x: 9, y: 9 });
    insertVertex(polygon, 0, { x: 9, y: 9 });
    removeVertex(polygon, 0);
    expect(polygon).toEqual(copy);
  });

  it('rotates rectangles by angle and wraps it', () => {
    expect(rotateShape(rect, 30).rotationDeg).toBe(30);
    expect(rotateShape({ ...rect, rotationDeg: 170 }, 30).rotationDeg).toBe(-160);
    expect(rotateShape({ ...rect, rotationDeg: -170 }, -30).rotationDeg).toBe(160);
  });

  it('rotates polygons about their center', () => {
    const rotated = rotateShape(polygon, 90);
    expect(shapeCenter(rotated)).toEqual(shapeCenter(polygon));
    expect(rotated.points[0]).toEqual({ x: 4, y: 0 });
  });

  it('leaves circles alone when rotating', () => {
    expect(rotateShape(circle, 90)).toEqual(circle);
  });

  it('resizes a circle to a point', () => {
    expect(resizeCircle(circle, { x: 5, y: 2 }).radius).toBe(3);
  });
});

describe('vertices', () => {
  it('moves, adds and removes on polygons', () => {
    expect(moveVertex(polygon, 1, { x: 9, y: 9 }).points[1]).toEqual({ x: 9, y: 9 });
    const added = insertVertex(polygon, 0, { x: 2, y: -1 });
    expect(added.points).toHaveLength(5);
    expect(added.points[1]).toEqual({ x: 2, y: -1 });
    expect(removeVertex(polygon, 0).points).toHaveLength(3);
  });

  it('keeps at least 3 points', () => {
    const smallest = removeVertex(polygon, 0);
    expect(removeVertex(smallest, 0).points).toHaveLength(3);
  });

  it("never changes a triangle's vertex count", () => {
    expect(insertVertex(triangle, 0, { x: 1, y: 1 }).points).toHaveLength(3);
    expect(removeVertex(triangle, 0).points).toHaveLength(3);
  });
});
