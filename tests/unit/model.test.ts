import { describe, expect, it } from 'vitest';
import {
  isJavaIdentifier,
  isJavaPackageName,
  toMethodName,
  validateProject,
} from '../../src/shared/model';
import type { RegionProject, Shape } from '../../src/shared/model';
import { sampleProject } from './fixtures/sampleProject';

const errorsOf = (project: RegionProject) =>
  validateProject(project)
    .filter((issue) => issue.severity === 'error')
    .map((issue) => issue.message);

function withShape(shape: Shape): RegionProject {
  return {
    ...sampleProject(),
    regions: [{ id: 'r', name: 'Zone', allianceMode: 'fixed', shapes: [shape] }],
  };
}

describe('Java names', () => {
  it('builds method names from region names', () => {
    expect(toMethodName('Scoring Zone')).toBe('isInScoringZone');
    expect(toMethodName('source-lane_2')).toBe('isInSourceLane2');
    expect(toMethodName('Área de ação')).toBe('isInAreaDeAcao');
    expect(toMethodName('2nd stage')).toBe('isIn2ndStage');
    expect(toMethodName('class')).toBe('isInClass');
  });

  it('returns null when nothing usable remains', () => {
    expect(toMethodName('')).toBeNull();
    expect(toMethodName('  --- ')).toBeNull();
    expect(toMethodName('区域')).toBeNull();
  });

  it('recognizes valid identifiers and package names', () => {
    expect(isJavaIdentifier('FieldRegions')).toBe(true);
    expect(isJavaIdentifier('class')).toBe(false);
    expect(isJavaIdentifier('1abc')).toBe(false);
    expect(isJavaIdentifier('a;b')).toBe(false);
    expect(isJavaPackageName('frc.robot.generated')).toBe(true);
    expect(isJavaPackageName('frc..robot')).toBe(false);
    expect(isJavaPackageName('frc.class')).toBe(false);
    expect(isJavaPackageName('frc.robot;\nimport x')).toBe(false);
  });
});

describe('validateProject', () => {
  it('accepts the sample project', () => {
    expect(validateProject(sampleProject())).toEqual([]);
  });

  it('rejects names that would generate the same method', () => {
    const project = sampleProject();
    project.regions[1]!.name = 'scoring zone';
    project.regions[0]!.name = 'Scoring-Zone';
    expect(errorsOf(project).join()).toContain('isInScoringZone');
  });

  it('rejects a region with no adding shape', () => {
    const project = withShape({
      id: 's',
      mode: 'subtract',
      kind: 'circle',
      cx: 0,
      cy: 0,
      radius: 1,
    });
    expect(errorsOf(project).join()).toContain('at least one shape that adds area');
  });

  it.each<[string, Shape]>([
    [
      'zero width',
      { id: 's', mode: 'add', kind: 'rect', cx: 0, cy: 0, width: 0, height: 1, rotationDeg: 0 },
    ],
    ['negative radius', { id: 's', mode: 'add', kind: 'circle', cx: 0, cy: 0, radius: -1 }],
    ['NaN', { id: 's', mode: 'add', kind: 'circle', cx: Number.NaN, cy: 0, radius: 1 }],
    [
      'infinity',
      {
        id: 's',
        mode: 'add',
        kind: 'rect',
        cx: 0,
        cy: Infinity,
        width: 1,
        height: 1,
        rotationDeg: 0,
      },
    ],
    [
      'triangle with 4 points',
      {
        id: 's',
        mode: 'add',
        kind: 'triangle',
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ],
      },
    ],
    [
      'polygon with 2 points',
      {
        id: 's',
        mode: 'add',
        kind: 'polygon',
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ],
      },
    ],
    [
      'collinear points',
      {
        id: 's',
        mode: 'add',
        kind: 'polygon',
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
          { x: 2, y: 2 },
        ],
      },
    ],
  ])('rejects a shape with %s', (_label, shape) => {
    expect(errorsOf(withShape(shape))).toHaveLength(1);
  });

  it('warns but does not block on a self-crossing polygon', () => {
    const bowtie: Shape = {
      id: 's',
      mode: 'add',
      kind: 'polygon',
      points: [
        { x: 0, y: 0 },
        { x: 2, y: 2 },
        { x: 2, y: 0 },
        { x: 0, y: 3 },
      ],
    };
    const issues = validateProject(withShape(bowtie));
    expect(issues.map((issue) => issue.severity)).toEqual(['warning']);
  });

  it('rejects unsafe output names and a bad field size', () => {
    const project = sampleProject();
    project.output = { packageName: 'frc.robot;evil', className: 'Field Regions' };
    project.field.lengthMeters = 0;
    expect(errorsOf(project)).toHaveLength(3);
  });
});
