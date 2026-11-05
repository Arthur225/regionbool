import { describe, expect, it } from 'vitest';
import {
  flipPoint,
  regionContains,
  regionContainsForAlliance,
  shapeContains,
} from '../../src/shared/geometry';
import type { FieldInfo, Region, Shape } from '../../src/shared/model';

const rect = (rotationDeg = 0): Shape => ({
  id: 's',
  mode: 'add',
  kind: 'rect',
  cx: 5,
  cy: 5,
  width: 4,
  height: 2,
  rotationDeg,
});

describe('rectangles', () => {
  it('includes the inside and the edges, and excludes the outside', () => {
    expect(shapeContains(rect(), 5, 5)).toBe(true);
    expect(shapeContains(rect(), 7, 6)).toBe(true);
    expect(shapeContains(rect(), 3, 4)).toBe(true);
    expect(shapeContains(rect(), 7.01, 5)).toBe(false);
    expect(shapeContains(rect(), 5, 6.01)).toBe(false);
  });

  it('rotates counterclockwise about the center', () => {
    expect(shapeContains(rect(90), 5, 6.9)).toBe(true);
    expect(shapeContains(rect(90), 6.9, 5)).toBe(false);
    // At 45 degrees, the long axis runs from lower left to upper right.
    expect(shapeContains(rect(45), 6, 6)).toBe(true);
    expect(shapeContains(rect(45), 6, 4)).toBe(false);
    expect(shapeContains(rect(-45), 6, 4)).toBe(true);
  });
});

describe('circles', () => {
  const circle: Shape = { id: 's', mode: 'add', kind: 'circle', cx: 1, cy: 1, radius: 2 };

  it('includes the edge and excludes the outside', () => {
    expect(shapeContains(circle, 1, 1)).toBe(true);
    expect(shapeContains(circle, 3, 1)).toBe(true);
    expect(shapeContains(circle, 3.01, 1)).toBe(false);
    expect(shapeContains(circle, 2.5, 2.5)).toBe(false);
  });
});

describe('polygons', () => {
  const concave: Shape = {
    id: 's',
    mode: 'add',
    kind: 'polygon',
    points: [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 2, y: 1 },
      { x: 0, y: 4 },
    ],
  };

  it('handles the notch of a concave polygon', () => {
    expect(shapeContains(concave, 1, 1)).toBe(true);
    expect(shapeContains(concave, 3, 1)).toBe(true);
    expect(shapeContains(concave, 2, 3)).toBe(false);
  });

  it('includes vertices and edges, including slanted ones', () => {
    expect(shapeContains(concave, 0, 0)).toBe(true);
    expect(shapeContains(concave, 4, 4)).toBe(true);
    expect(shapeContains(concave, 2, 0)).toBe(true);
    expect(shapeContains(concave, 3, 2.5)).toBe(true);
    expect(shapeContains(concave, 2, 1)).toBe(true);
  });

  it('gives the same answer in either winding direction', () => {
    const reversed: Shape = {
      ...concave,
      points: [...(concave as { points: { x: number; y: number }[] }).points].reverse(),
    } as Shape;
    for (const [x, y] of [
      [1, 1],
      [2, 3],
      [3, 2.5],
      [5, 5],
    ] as const) {
      expect(shapeContains(reversed, x, y)).toBe(shapeContains(concave, x, y));
    }
  });
});

describe('regions', () => {
  const region: Region = {
    id: 'r',
    name: 'Zone',
    allianceMode: 'fixed',
    shapes: [
      { id: 'a', mode: 'add', kind: 'circle', cx: 0, cy: 0, radius: 2 },
      { id: 'b', mode: 'add', kind: 'circle', cx: 3, cy: 0, radius: 2 },
      { id: 'h', mode: 'subtract', kind: 'circle', cx: 0, cy: 0, radius: 1 },
    ],
  };

  it('is a union of adding shapes', () => {
    expect(regionContains(region, -1.5, 0)).toBe(true);
    expect(regionContains(region, 4.5, 0)).toBe(true);
    expect(regionContains(region, 0, 5)).toBe(false);
  });

  it('excludes holes, including exactly on the edge of a hole', () => {
    expect(regionContains(region, 0, 0)).toBe(false);
    expect(regionContains(region, 1, 0)).toBe(false);
  });

  it('applies a hole regardless of shape order', () => {
    const reordered: Region = { ...region, shapes: [...region.shapes].reverse() };
    expect(regionContains(reordered, 0, 0)).toBe(false);
  });

  it('is false with only holes', () => {
    const holesOnly: Region = { ...region, shapes: [region.shapes[2]!] };
    expect(regionContains(holesOnly, 0, 0)).toBe(false);
    expect(regionContains(holesOnly, 5, 5)).toBe(false);
  });
});

describe('alliance flipping', () => {
  const rotational: FieldInfo = { lengthMeters: 16, widthMeters: 8, symmetry: 'rotational' };
  const mirrored: FieldInfo = { lengthMeters: 16, widthMeters: 8, symmetry: 'mirrored' };
  const relative: Region = {
    id: 'r',
    name: 'Corner',
    allianceMode: 'alliance-relative',
    shapes: [
      { id: 's', mode: 'add', kind: 'rect', cx: 1, cy: 1, width: 2, height: 2, rotationDeg: 0 },
    ],
  };

  it('flips points according to the field symmetry', () => {
    expect(flipPoint(1, 2, rotational)).toEqual({ x: 15, y: 6 });
    expect(flipPoint(1, 2, mirrored)).toEqual({ x: 15, y: 2 });
  });

  it('moves an alliance-relative region to the matching corner on red', () => {
    expect(regionContainsForAlliance(relative, 1, 1, 'blue', rotational)).toBe(true);
    expect(regionContainsForAlliance(relative, 1, 1, 'red', rotational)).toBe(false);
    expect(regionContainsForAlliance(relative, 15, 7, 'red', rotational)).toBe(true);
    expect(regionContainsForAlliance(relative, 15, 1, 'red', mirrored)).toBe(true);
    expect(regionContainsForAlliance(relative, 15, 7, 'red', mirrored)).toBe(false);
  });

  it('treats an unknown alliance as blue', () => {
    expect(regionContainsForAlliance(relative, 1, 1, 'unknown', rotational)).toBe(true);
    expect(regionContainsForAlliance(relative, 15, 7, 'unknown', rotational)).toBe(false);
  });

  it('never flips a field-fixed region', () => {
    const fixed: Region = { ...relative, allianceMode: 'fixed' };
    expect(regionContainsForAlliance(fixed, 1, 1, 'red', rotational)).toBe(true);
    expect(regionContainsForAlliance(fixed, 15, 7, 'red', rotational)).toBe(false);
  });
});
