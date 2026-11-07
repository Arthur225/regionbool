/**
 * Pure operations for editing shapes. The canvas turns pointer movement into these calls, and none
 * of them touch the shape they're given. All values are in meters, with angles in degrees.
 */
import { rectRotation } from './geometry';
import type { CircleShape, FieldInfo, Point, PolygonShape, RectShape, Shape } from './model';

/** Drawing smaller than this is treated as an accidental click. */
export const MIN_SHAPE_SIZE_METERS = 0.05;

/** Rounds to the nearest millimeter, so generated code doesn't carry meaningless digits. */
export function roundMeters(value: number): number {
  return Math.round(value * 1000) / 1000 || 0;
}

/** Rounds a value to a grid step, or to the nearest millimeter when `gridMeters` is null. */
export function snapValue(value: number, gridMeters: number | null): number {
  return gridMeters === null
    ? roundMeters(value)
    : roundMeters(Math.round(value / gridMeters) * gridMeters);
}

/** Applies {@link snapValue} to both coordinates of a point. */
export function snapPoint(point: Point, gridMeters: number | null): Point {
  return { x: snapValue(point.x, gridMeters), y: snapValue(point.y, gridMeters) };
}

/** Keeps a point within the field. */
export function clampToField(point: Point, field: FieldInfo): Point {
  return {
    x: Math.min(Math.max(point.x, 0), field.lengthMeters),
    y: Math.min(Math.max(point.y, 0), field.widthMeters),
  };
}

/** Returns a rectangle's corners, in order around it, starting from its local top right. */
export function rectCorners(shape: RectShape): Point[] {
  const { cos, sin } = rectRotation(shape);
  const halfWidth = shape.width / 2;
  const halfHeight = shape.height / 2;
  const signs: [number, number][] = [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
  ];
  return signs.map(([u, v]) => {
    const localX = u * halfWidth;
    const localY = v * halfHeight;
    return {
      x: shape.cx + localX * cos - localY * sin,
      y: shape.cy + localX * sin + localY * cos,
    };
  });
}

/** How many sides a circle gets when it has to be drawn as a path, such as on a Field2d. */
const CIRCLE_OUTLINE_SIDES = 32;

/** Returns points around a shape's outline, without repeating the first one. */
export function shapeOutline(shape: Shape): Point[] {
  if (shape.kind === 'rect') return rectCorners(shape);
  if (shape.kind !== 'circle') return shape.points;
  return Array.from({ length: CIRCLE_OUTLINE_SIDES }, (_, i) => {
    const angle = (i * 2 * Math.PI) / CIRCLE_OUTLINE_SIDES;
    return {
      x: roundMeters(shape.cx + shape.radius * Math.cos(angle)),
      y: roundMeters(shape.cy + shape.radius * Math.sin(angle)),
    };
  });
}

/** Returns a shape's center: the average of a polygon's vertices. */
export function shapeCenter(shape: Shape): Point {
  if (shape.kind === 'rect' || shape.kind === 'circle') return { x: shape.cx, y: shape.cy };
  const sum = shape.points.reduce((total, p) => ({ x: total.x + p.x, y: total.y + p.y }), {
    x: 0,
    y: 0,
  });
  return { x: sum.x / shape.points.length, y: sum.y / shape.points.length };
}

/** Returns a new rectangle from two opposite corners, or null if it would be too small. */
export function rectFromDrag(a: Point, b: Point): Omit<RectShape, 'id' | 'mode'> | null {
  const width = Math.abs(a.x - b.x);
  const height = Math.abs(a.y - b.y);
  if (width < MIN_SHAPE_SIZE_METERS || height < MIN_SHAPE_SIZE_METERS) return null;
  return {
    kind: 'rect',
    cx: roundMeters((a.x + b.x) / 2),
    cy: roundMeters((a.y + b.y) / 2),
    width: roundMeters(width),
    height: roundMeters(height),
    rotationDeg: 0,
  };
}

/** Returns a new circle from its center and a point on its edge, or null if it would be too small. */
export function circleFromDrag(
  center: Point,
  edge: Point,
): Omit<CircleShape, 'id' | 'mode'> | null {
  const radius = Math.hypot(edge.x - center.x, edge.y - center.y);
  if (radius < MIN_SHAPE_SIZE_METERS) return null;
  return { kind: 'circle', cx: center.x, cy: center.y, radius: roundMeters(radius) };
}

/** Moves a shape. */
export function translateShape<S extends Shape>(shape: S, dx: number, dy: number): S {
  if (shape.kind === 'rect' || shape.kind === 'circle') {
    return { ...shape, cx: roundMeters(shape.cx + dx), cy: roundMeters(shape.cy + dy) };
  }
  return {
    ...shape,
    points: shape.points.map((p) => ({ x: roundMeters(p.x + dx), y: roundMeters(p.y + dy) })),
  };
}

function normalizeDegrees(degrees: number): number {
  const wrapped = ((((degrees + 180) % 360) + 360) % 360) - 180;
  return Math.round(wrapped * 10) / 10 || 0;
}

/** Rotates a shape counterclockwise about its center. A circle doesn't change. */
export function rotateShape<S extends Shape>(shape: S, degrees: number): S {
  if (shape.kind === 'circle') return shape;
  if (shape.kind === 'rect') {
    return { ...shape, rotationDeg: normalizeDegrees(shape.rotationDeg + degrees) };
  }
  const center = shapeCenter(shape);
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    ...shape,
    points: shape.points.map((p) => {
      const dx = p.x - center.x;
      const dy = p.y - center.y;
      return {
        x: roundMeters(center.x + dx * cos - dy * sin),
        y: roundMeters(center.y + dx * sin + dy * cos),
      };
    }),
  };
}

/** Moves one corner of a rectangle while its opposite corner stays still, keeping its rotation. */
export function resizeRectCorner(shape: RectShape, corner: number, to: Point): RectShape {
  const fixed = rectCorners(shape)[(corner + 2) % 4]!;
  const { cos, sin } = rectRotation(shape);
  const dx = to.x - fixed.x;
  const dy = to.y - fixed.y;
  const localWidth = Math.abs(dx * cos + dy * sin);
  const localHeight = Math.abs(dy * cos - dx * sin);
  return {
    ...shape,
    cx: roundMeters((fixed.x + to.x) / 2),
    cy: roundMeters((fixed.y + to.y) / 2),
    width: Math.max(roundMeters(localWidth), MIN_SHAPE_SIZE_METERS),
    height: Math.max(roundMeters(localHeight), MIN_SHAPE_SIZE_METERS),
  };
}

/** Sets a circle's radius so its edge passes through a point. */
export function resizeCircle(shape: CircleShape, to: Point): CircleShape {
  const radius = Math.hypot(to.x - shape.cx, to.y - shape.cy);
  return { ...shape, radius: Math.max(roundMeters(radius), MIN_SHAPE_SIZE_METERS) };
}

/** Moves one vertex of a triangle or polygon. */
export function moveVertex(shape: PolygonShape, index: number, to: Point): PolygonShape {
  return { ...shape, points: shape.points.map((p, i) => (i === index ? to : p)) };
}

/** Adds a vertex after the given index. Only polygons can have vertices added. */
export function insertVertex(shape: PolygonShape, afterIndex: number, point: Point): PolygonShape {
  if (shape.kind !== 'polygon') return shape;
  const points = [...shape.points];
  points.splice(afterIndex + 1, 0, point);
  return { ...shape, points };
}

/** Removes a vertex. Only polygons can have vertices removed, and they keep at least 3. */
export function removeVertex(shape: PolygonShape, index: number): PolygonShape {
  if (shape.kind !== 'polygon' || shape.points.length <= 3) return shape;
  return { ...shape, points: shape.points.filter((_, i) => i !== index) };
}
