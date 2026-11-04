import type { FieldSymmetry, RegionProject } from '../../../src/shared/model';

/** A project that uses every shape, both modes and both alliance behaviors. */
export function sampleProject(symmetry: FieldSymmetry = 'rotational'): RegionProject {
  return {
    version: 1,
    field: { lengthMeters: 16.54, widthMeters: 8.07, symmetry },
    output: { packageName: 'frc.robot.generated', className: 'FieldRegions' },
    regions: [
      {
        id: 'r1',
        name: 'Scoring Zone',
        allianceMode: 'alliance-relative',
        shapes: [
          {
            id: 's1',
            mode: 'add',
            kind: 'rect',
            cx: 3,
            cy: 4,
            width: 4,
            height: 2,
            rotationDeg: 30,
          },
          { id: 's2', mode: 'add', kind: 'circle', cx: 5, cy: 6, radius: 1.25 },
          { id: 's3', mode: 'subtract', kind: 'circle', cx: 3, cy: 4, radius: 0.5 },
        ],
      },
      {
        id: 'r2',
        name: 'Área do centro',
        allianceMode: 'fixed',
        shapes: [
          {
            id: 's4',
            mode: 'add',
            kind: 'polygon',
            // Concave, so a wrong test would count the notch as inside.
            points: [
              { x: 7, y: 2 },
              { x: 10, y: 2 },
              { x: 10, y: 6 },
              { x: 8.5, y: 3.5 },
              { x: 7, y: 6 },
            ],
          },
          {
            id: 's5',
            mode: 'subtract',
            kind: 'triangle',
            points: [
              { x: 8, y: 2.5 },
              { x: 9, y: 2.5 },
              { x: 8.5, y: 3 },
            ],
          },
        ],
      },
      {
        id: 'r3',
        name: 'source-lane',
        allianceMode: 'alliance-relative',
        shapes: [
          {
            id: 's6',
            mode: 'add',
            kind: 'triangle',
            points: [
              { x: 0, y: 0 },
              { x: 2, y: 0 },
              { x: 0, y: 2 },
            ],
          },
        ],
      },
    ],
  };
}
