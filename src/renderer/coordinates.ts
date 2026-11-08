/**
 * Shows coordinates in the robot code's system. Shapes are always stored with the origin at the blue
 * corner, so the editor converts numbers on the way in and out; the canvas itself never changes.
 */
import type { FieldInfo, FieldOrigin } from '../shared/model';
import { useEditor } from './store';

/** Removes floating-point noise such as 1.7705000000000002 left by converting. */
function clean(value: number): number {
  return Number.parseFloat(value.toPrecision(12));
}

/** Converts one axis between stored and shown values. The conversion is its own inverse. */
export interface AxisConverter {
  x(value: number): number;
  y(value: number): number;
}

export function axisConverter(field: FieldInfo, origin: FieldOrigin): AxisConverter {
  if (origin === 'blue-corner') return { x: (v) => v, y: (v) => v };
  return {
    x: (v) => clean(field.lengthMeters / 2 - v),
    y: (v) => clean(field.widthMeters / 2 - v),
  };
}

/** The converter for the open project's field and coordinate system. */
export function useAxisConverter(): AxisConverter {
  const field = useEditor((s) => s.doc.field);
  const origin = useEditor((s) => s.doc.output.fieldOrigin ?? 'blue-corner');
  return axisConverter(field, origin);
}
