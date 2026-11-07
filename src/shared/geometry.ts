/**
 * The reference definition of "inside": what the generated Java must do.
 *
 * Invariant: `codegen.ts` emits the same formulas in Java, and the generated code must agree with
 * these functions on every point, including exact edges. If you change one, change the other.
 * `tests/unit/java-crosscheck.test.ts` compiles and runs the Java to prove they match.
 */
import type { FieldInfo, Point, PolygonShape, RectShape, Region, Shape } from './model';

/**
 * How close to an edge a point can be and still count as on it, in meters. Keeps a point exactly
 * on an edge from giving different answers because of floating-point rounding.
 */
export const EDGE_TOLERANCE_METERS = 1e-9;

/** The robot's alliance. An `unknown` alliance is treated as blue. */
export type AllianceState = 'red' | 'blue' | 'unknown';

/**
 * Returns the cosine and sine of a rectangle's rotation. Generated Java embeds these values rather
 * than recomputing them, because `Math.cos` can round differently in Java and JavaScript.
 */
export function rectRotation(shape: RectShape): { cos: number; sin: number } {
  const radians = (shape.rotationDeg * Math.PI) / 180;
  return { cos: Math.cos(radians), sin: Math.sin(radians) };
}

function inRect(
  x: number,
  y: number,
  cx: number,
  cy: number,
  halfWidth: number,
  halfHeight: number,
  cos: number,
  sin: number,
): boolean {
  const dx = x - cx;
  const dy = y - cy;
  const localX = dx * cos + dy * sin;
  const localY = dy * cos - dx * sin;
  return (
    Math.abs(localX) <= halfWidth + EDGE_TOLERANCE_METERS &&
    Math.abs(localY) <= halfHeight + EDGE_TOLERANCE_METERS
  );
}

function inCircle(x: number, y: number, cx: number, cy: number, radius: number): boolean {
  const dx = x - cx;
  const dy = y - cy;
  const limit = radius + EDGE_TOLERANCE_METERS;
  return dx * dx + dy * dy <= limit * limit;
}

/** Tests a polygon using the even-odd rule, counting points on an edge as inside. */
function inPolygon(x: number, y: number, points: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const { x: xi, y: yi } = points[i]!;
    const { x: xj, y: yj } = points[j]!;
    const edgeX = xj - xi;
    const edgeY = yj - yi;
    const cross = (x - xi) * edgeY - (y - yi) * edgeX;
    const onLine =
      cross * cross <=
      EDGE_TOLERANCE_METERS * EDGE_TOLERANCE_METERS * (edgeX * edgeX + edgeY * edgeY);
    if (
      onLine &&
      x >= Math.min(xi, xj) - EDGE_TOLERANCE_METERS &&
      x <= Math.max(xi, xj) + EDGE_TOLERANCE_METERS &&
      y >= Math.min(yi, yj) - EDGE_TOLERANCE_METERS &&
      y <= Math.max(yi, yj) + EDGE_TOLERANCE_METERS
    ) {
      return true;
    }
    if (yi > y !== yj > y && x < (edgeX * (y - yi)) / edgeY + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Returns whether a point in field coordinates is inside a shape, ignoring its add/subtract mode. */
export function shapeContains(shape: Shape, x: number, y: number): boolean {
  switch (shape.kind) {
    case 'rect': {
      const { cos, sin } = rectRotation(shape);
      return inRect(x, y, shape.cx, shape.cy, shape.width / 2, shape.height / 2, cos, sin);
    }
    case 'circle':
      return inCircle(x, y, shape.cx, shape.cy, shape.radius);
    case 'triangle':
    case 'polygon':
      return inPolygon(x, y, (shape as PolygonShape).points);
  }
}

/**
 * Returns whether a point is inside a region as drawn, with no alliance flip: it must be in at
 * least one adding shape and in no hole. A point exactly on a hole's edge is outside the region.
 */
export function regionContains(region: Region, x: number, y: number): boolean {
  let inAdded = false;
  for (const shape of region.shapes) {
    if (!shapeContains(shape, x, y)) continue;
    if (shape.mode === 'subtract') return false;
    inAdded = true;
  }
  return inAdded;
}

/** Maps a point to the other alliance's side of the field. */
export function flipPoint(x: number, y: number, field: FieldInfo): Point {
  return {
    x: field.lengthMeters - x,
    y: field.symmetry === 'rotational' ? field.widthMeters - y : y,
  };
}

/**
 * Returns the same answer the generated Java method gives for a robot on the given alliance.
 * Alliance-relative regions are drawn from blue's side, so on red the point is flipped first.
 */
export function regionContainsForAlliance(
  region: Region,
  x: number,
  y: number,
  alliance: AllianceState,
  field: FieldInfo,
): boolean {
  if (region.allianceMode === 'alliance-relative' && alliance === 'red') {
    const flipped = flipPoint(x, y, field);
    return regionContains(region, flipped.x, flipped.y);
  }
  return regionContains(region, x, y);
}
