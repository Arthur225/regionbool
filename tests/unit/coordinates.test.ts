import { describe, expect, it } from 'vitest';
import { axisConverter } from '../../src/renderer/coordinates';
import type { FieldInfo } from '../../src/shared/model';

const field: FieldInfo = { lengthMeters: 16.541, widthMeters: 8.069, symmetry: 'rotational' };

describe('axisConverter', () => {
  it('shows stored values unchanged for the blue-corner origin', () => {
    const shown = axisConverter(field, 'blue-corner');
    expect(shown.x(6.5)).toBe(6.5);
    expect(shown.y(1.5)).toBe(1.5);
  });

  it('shows center-origin values without rounding noise', () => {
    const shown = axisConverter(field, 'center');
    expect(shown.x(6.5)).toBe(1.7705);
    expect(shown.y(1.5)).toBe(2.5345);
    expect(shown.x(shown.x(6.5))).toBe(6.5);
  });
});
