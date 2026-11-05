/**
 * Field definitions: a field's size and symmetry, plus how its image maps to field coordinates.
 *
 * The file format extends the JSON that Elastic ships, which has `field-size` in meters and
 * `field-corners` in image pixels, with an optional `symmetry`. See `docs/fields.md`.
 */
import type { FieldSymmetry } from './model';

/** A field the user can draw on. */
export interface FieldDefinition {
  /** The definition file's name without `.json`, such as `2025-reefscape`. */
  id: string;
  /** Game name, such as "Reefscape". */
  game: string;
  /** Size along x, in meters. */
  lengthMeters: number;
  /** Size along y, in meters. */
  widthMeters: number;
  /** Null when the file doesn't say, in which case the user has to choose. */
  symmetry: FieldSymmetry | null;
  /** The image file's name, with any folders removed. */
  imageFile: string;
  /**
   * True if the image shows red on the left, so it has to be turned 180 degrees to match field
   * coordinates, which put blue at x = 0. Field images don't agree on this, so check each one.
   */
  imageRotated: boolean;
  /** Pixel position of the field's top-left corner in the image, `[x, y]`. */
  topLeftPixel: [number, number];
  /** Pixel position of the field's bottom-right corner in the image, `[x, y]`. */
  bottomRightPixel: [number, number];
}

/** The characters allowed in a field id, which also keeps ids from being used as file paths. */
const FIELD_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const IMAGE_FILE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(png|jpe?g)$/i;

/** Returns whether `id` is safe to use as a field id. */
export function isFieldId(id: string): boolean {
  return FIELD_ID_PATTERN.test(id);
}

function isPositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function pixelPair(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [x, y] = value as unknown[];
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [x, y];
}

/**
 * Parses the contents of a field definition file. Returns null if it isn't valid. These files can
 * come from a robot project, so the image path is reduced to a plain file name here.
 */
export function parseFieldDefinition(id: string, json: unknown): FieldDefinition | null {
  if (!isFieldId(id) || typeof json !== 'object' || json === null) return null;
  const data = json as Record<string, unknown>;

  const size = data['field-size'];
  if (!Array.isArray(size) || size.length !== 2) return null;
  const [length, width] = size as unknown[];
  if (!isPositive(length) || !isPositive(width)) return null;

  const corners = data['field-corners'] as Record<string, unknown> | null | undefined;
  const topLeft = pixelPair(corners?.['top-left']);
  const bottomRight = pixelPair(corners?.['bottom-right']);
  if (!topLeft || !bottomRight) return null;
  if (bottomRight[0] <= topLeft[0] || bottomRight[1] <= topLeft[1]) return null;

  const image = data['field-image'];
  if (typeof image !== 'string') return null;
  const imageFile = image.split(/[\\/]/).at(-1) ?? '';
  if (!IMAGE_FILE_PATTERN.test(imageFile)) return null;

  const symmetry = data['symmetry'];
  if (symmetry !== undefined && symmetry !== 'rotational' && symmetry !== 'mirrored') return null;

  return {
    id,
    game: typeof data['game'] === 'string' ? data['game'] : id,
    lengthMeters: length,
    widthMeters: width,
    symmetry: symmetry ?? null,
    imageFile,
    imageRotated: data['image-rotated'] === true,
    topLeftPixel: topLeft,
    bottomRightPixel: bottomRight,
  };
}
