/**
 * The region data model and its validation rules.
 *
 * All coordinates and lengths are WPILib field coordinates in meters: the origin is at the
 * blue alliance wall, +x points toward red, and +y points to the left seen from blue.
 * The on-disk form of {@link RegionProject} is described by `schemas/regions.schema.json`.
 */

/** Current version of the `.regionbool/regions.json` format. */
export const REGIONS_FILE_VERSION = 1;

/** A position on the field, in meters. */
export interface Point {
  x: number;
  y: number;
}

/** Whether a shape adds area to its region or cuts a hole in it. */
export type ShapeMode = 'add' | 'subtract';

interface ShapeBase {
  /** Stable identifier, unique within the project. Never appears in generated code. */
  id: string;
  mode: ShapeMode;
}

/** A rectangle, which may be rotated about its center. */
export interface RectShape extends ShapeBase {
  kind: 'rect';
  /** Center x, in meters. */
  cx: number;
  /** Center y, in meters. */
  cy: number;
  /** Size along the shape's local x axis, in meters. */
  width: number;
  /** Size along the shape's local y axis, in meters. */
  height: number;
  /** Counterclockwise rotation about the center, in degrees. */
  rotationDeg: number;
}

/** A circle. */
export interface CircleShape extends ShapeBase {
  kind: 'circle';
  /** Center x, in meters. */
  cx: number;
  /** Center y, in meters. */
  cy: number;
  /** Radius, in meters. */
  radius: number;
}

/**
 * A triangle (exactly 3 points) or free polygon (3 or more points).
 * There's no stored rotation: rotating one of these rewrites its points.
 */
export interface PolygonShape extends ShapeBase {
  kind: 'triangle' | 'polygon';
  /** Vertices in order, in either winding direction, without repeating the first. */
  points: Point[];
}

/** Any shape a region can contain. */
export type Shape = RectShape | CircleShape | PolygonShape;

/**
 * How a region responds to the robot's alliance.
 * - `fixed`: the region is at the same physical place for both alliances.
 * - `alliance-relative`: the region is drawn from blue's side and flips when on red.
 */
export type AllianceMode = 'fixed' | 'alliance-relative';

/** A named area of the field, which becomes one generated boolean method. */
export interface Region {
  /** Stable identifier, unique within the project. Never appears in generated code. */
  id: string;
  /** Display name, such as "Scoring Zone". The Java method name comes from {@link toMethodName}. */
  name: string;
  allianceMode: AllianceMode;
  shapes: Shape[];
}

/**
 * How a season's field maps one alliance's side onto the other.
 * - `rotational`: a 180 degree turn about the center, `(L-x, W-y)`.
 * - `mirrored`: a reflection across the center line, `(L-x, y)`.
 */
export type FieldSymmetry = 'rotational' | 'mirrored';

/** The field the regions are drawn on. */
export interface FieldInfo {
  /** Size along x, in meters. */
  lengthMeters: number;
  /** Size along y, in meters. */
  widthMeters: number;
  symmetry: FieldSymmetry;
}

/** Where the generated class goes. */
export interface OutputInfo {
  /** Java package, such as `frc.robot.generated`. */
  packageName: string;
  /** Java class name, such as `FieldRegions`. */
  className: string;
}

/** Everything saved for one robot project in `.regionbool/regions.json`. */
export interface RegionProject {
  version: typeof REGIONS_FILE_VERSION;
  field: FieldInfo;
  output: OutputInfo;
  regions: Region[];
}

/** One problem found by {@link validateProject}. */
export interface ValidationIssue {
  /** `error` blocks code generation, `warning` is only shown to the user. */
  severity: 'error' | 'warning';
  /** The region involved, when there is one. */
  regionId?: string;
  /** The shape involved, when there is one. */
  shapeId?: string;
  message: string;
}

const JAVA_RESERVED_WORDS = new Set(
  `abstract assert boolean break byte case catch char class const continue default do double else
  enum extends final finally float for goto if implements import instanceof int interface long
  native new package private protected public return short static strictfp super switch
  synchronized this throw throws transient try void volatile while true false null`.split(/\s+/),
);

/** Returns whether `name` can be used as a Java identifier. ASCII only, to avoid encoding issues. */
export function isJavaIdentifier(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !JAVA_RESERVED_WORDS.has(name) && name !== '_';
}

/** Returns whether `name` is a valid dotted Java package name. */
export function isJavaPackageName(name: string): boolean {
  return name.split('.').every(isJavaIdentifier);
}

/**
 * Converts a region's display name to its Java method name: "Área de score" becomes
 * `isInAreaDeScore`. Accents are removed and other non-alphanumeric characters separate words.
 * Returns null if the name has no usable characters.
 */
export function toMethodName(regionName: string): string | null {
  const words = regionName
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word.length > 0);
  if (words.length === 0) return null;
  return 'isIn' + words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('');
}

/** Returns the signed area of a polygon. Its sign depends on the winding direction. */
function signedArea(points: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

function crossSign(a: Point, b: Point, c: Point): number {
  return Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
}

/** Returns whether any two non-adjacent edges of a polygon properly cross each other. */
function isSelfIntersecting(points: readonly Point[]): boolean {
  const n = points.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // These two edges share the first vertex.
      const a = points[i]!;
      const b = points[(i + 1) % n]!;
      const c = points[j]!;
      const d = points[(j + 1) % n]!;
      if (
        crossSign(a, b, c) * crossSign(a, b, d) < 0 &&
        crossSign(c, d, a) * crossSign(c, d, b) < 0
      ) {
        return true;
      }
    }
  }
  return false;
}

function shapeNumbers(shape: Shape): number[] {
  switch (shape.kind) {
    case 'rect':
      return [shape.cx, shape.cy, shape.width, shape.height, shape.rotationDeg];
    case 'circle':
      return [shape.cx, shape.cy, shape.radius];
    case 'triangle':
    case 'polygon':
      return shape.points.flatMap((point) => [point.x, point.y]);
  }
}

function validateShape(shape: Shape): string[] {
  if (!shapeNumbers(shape).every(Number.isFinite))
    return ['has a value that is not a finite number'];
  switch (shape.kind) {
    case 'rect':
      return shape.width > 0 && shape.height > 0 ? [] : ['must have a positive width and height'];
    case 'circle':
      return shape.radius > 0 ? [] : ['must have a positive radius'];
    case 'triangle':
    case 'polygon': {
      if (shape.kind === 'triangle' && shape.points.length !== 3)
        return ['must have exactly 3 points'];
      if (shape.points.length < 3) return ['must have at least 3 points'];
      return Math.abs(signedArea(shape.points)) > 1e-9 ? [] : ['has no area'];
    }
  }
}

/**
 * Checks a project for problems. Code generation refuses projects with any `error` issue, which
 * also protects it from malformed files, since project files can come from anywhere.
 */
export function validateProject(project: RegionProject): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const error = (message: string, regionId?: string, shapeId?: string) =>
    issues.push({
      severity: 'error',
      message,
      ...(regionId !== undefined && { regionId }),
      ...(shapeId !== undefined && { shapeId }),
    });

  const { field, output } = project;
  if (
    !(field.lengthMeters > 0 && field.widthMeters > 0) ||
    !Number.isFinite(field.lengthMeters + field.widthMeters)
  ) {
    error('The field must have a positive length and width.');
  }
  if (!isJavaPackageName(output.packageName)) {
    error(`"${output.packageName}" is not a valid Java package name.`);
  }
  if (!isJavaIdentifier(output.className)) {
    error(`"${output.className}" is not a valid Java class name.`);
  }

  const regionByMethod = new Map<string, string>();
  for (const region of project.regions) {
    const method = toMethodName(region.name);
    if (method === null) {
      error(
        `The region name "${region.name}" has no letters or digits to build a method name from.`,
        region.id,
      );
    } else if (regionByMethod.has(method)) {
      error(
        `The regions "${regionByMethod.get(method)}" and "${region.name}" would both generate ${method}().`,
        region.id,
      );
    } else {
      regionByMethod.set(method, region.name);
    }

    if (!region.shapes.some((shape) => shape.mode === 'add')) {
      error(`The region "${region.name}" needs at least one shape that adds area.`, region.id);
    }
    for (const shape of region.shapes) {
      for (const problem of validateShape(shape)) {
        error(`A ${shape.kind} in "${region.name}" ${problem}.`, region.id, shape.id);
      }
      if (shape.kind === 'polygon' && isSelfIntersecting(shape.points)) {
        issues.push({
          severity: 'warning',
          regionId: region.id,
          shapeId: shape.id,
          message: `A polygon in "${region.name}" crosses itself, so areas that overlap an even number of times count as outside.`,
        });
      }
    }
  }
  return issues;
}
