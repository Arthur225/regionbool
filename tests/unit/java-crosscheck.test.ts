/**
 * Proves the generated Java and the preview agree: compiles the generated class with javac, runs it
 * over thousands of points on each alliance, and compares every answer to geometry.ts.
 *
 * WPILib classes are replaced with small stubs so this needs only a JDK. Skipped if there's no JDK.
 * `java-wpilib.test.ts` separately compiles against real WPILib.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { generateJava } from '../../src/shared/codegen';
import { regionContainsForAlliance, rectRotation } from '../../src/shared/geometry';
import type { AllianceState } from '../../src/shared/geometry';
import { JAVA_PROFILES, type JavaProfile } from '../../src/shared/javaProfiles';
import { toMethodName } from '../../src/shared/model';
import type { FieldSymmetry, Point, RegionProject, Shape } from '../../src/shared/model';
import { sampleProject } from './fixtures/sampleProject';

const hasJdk = spawnSync('javac', ['-version']).status === 0;
const ALLIANCES: readonly AllianceState[] = ['blue', 'red', 'unknown'];

const tempDirs: string[] = [];
afterAll(() => tempDirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function writeSource(root: string, relativePath: string, source: string): string {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, source);
  return path;
}

/** Minimal stand-ins for the WPILib classes generated code uses, matching their real signatures. */
function stubs(profile: JavaProfile): Record<string, string> {
  const geometry = (pkg: string) => ({
    [`${pkg.replaceAll('.', '/')}/Translation2d.java`]: `package ${pkg};
      public class Translation2d {
        private final double x, y;
        public Translation2d(double x, double y) { this.x = x; this.y = y; }
        public double getX() { return x; }
        public double getY() { return y; }
      }`,
    [`${pkg.replaceAll('.', '/')}/Pose2d.java`]: `package ${pkg};
      public class Pose2d {
        private final Translation2d t;
        public Pose2d(Translation2d t) { this.t = t; }
        public Translation2d getTranslation() { return t; }
      }`,
  });
  if (profile.id === 'legacy') {
    return {
      ...geometry('edu.wpi.first.math.geometry'),
      'edu/wpi/first/wpilibj/DriverStation.java': `package edu.wpi.first.wpilibj;
        import java.util.Optional;
        public class DriverStation {
          public enum Alliance { Red, Blue }
          public static Optional<Alliance> current = Optional.empty();
          public static Optional<Alliance> getAlliance() { return current; }
        }`,
    };
  }
  return {
    ...geometry('org.wpilib.math.geometry'),
    'org/wpilib/driverstation/Alliance.java': `package org.wpilib.driverstation;
      public enum Alliance { RED, BLUE }`,
    'org/wpilib/driverstation/MatchState.java': `package org.wpilib.driverstation;
      import java.util.Optional;
      public class MatchState {
        public static Optional<Alliance> current = Optional.empty();
        public static Optional<Alliance> getAlliance() { return current; }
      }`,
  };
}

/** Builds a harness that prints one line of 0s and 1s per point, for each alliance and overload. */
function harness(project: RegionProject, profile: JavaProfile): string {
  const legacy = profile.id === 'legacy';
  const geometryPackage = legacy ? 'edu.wpi.first.math.geometry' : 'org.wpilib.math.geometry';
  const setAlliance = legacy
    ? `edu.wpi.first.wpilibj.DriverStation.current = name.isEmpty() ? java.util.Optional.empty()
         : java.util.Optional.of(name.equals("red") ? edu.wpi.first.wpilibj.DriverStation.Alliance.Red : edu.wpi.first.wpilibj.DriverStation.Alliance.Blue);`
    : `org.wpilib.driverstation.MatchState.current = name.isEmpty() ? java.util.Optional.empty()
         : java.util.Optional.of(name.equals("red") ? org.wpilib.driverstation.Alliance.RED : org.wpilib.driverstation.Alliance.BLUE);`;
  const checks = project.regions
    .map((region) => {
      const method = `${project.output.packageName}.${project.output.className}.${toMethodName(region.name)}`;
      return `b.append(${method}(t) ? '1' : '0'); b.append(${method}(pose) ? '1' : '0');`;
    })
    .join('\n');
  return `import ${geometryPackage}.*;
    import java.nio.file.*;
    public class Harness {
      public static void main(String[] args) throws Exception {
        StringBuilder b = new StringBuilder();
        for (String name : new String[] {"blue", "red", ""}) {
          ${setAlliance}
          for (String line : Files.readAllLines(Path.of(args[0]))) {
            String[] parts = line.split(" ");
            Translation2d t = new Translation2d(Double.parseDouble(parts[0]), Double.parseDouble(parts[1]));
            Pose2d pose = new Pose2d(t);
            ${checks}
            b.append('\\n');
          }
        }
        System.out.print(b);
      }
    }`;
}

function shapeVertices(shape: Shape): Point[] {
  switch (shape.kind) {
    case 'rect': {
      const { cos, sin } = rectRotation(shape);
      return [
        [1, 1],
        [1, -1],
        [-1, -1],
        [-1, 1],
      ].map(([u, v]) => {
        const lx = (u! * shape.width) / 2;
        const ly = (v! * shape.height) / 2;
        return { x: shape.cx + lx * cos - ly * sin, y: shape.cy + lx * sin + ly * cos };
      });
    }
    case 'circle':
      return [0, 1, 2, 3].map((i) => {
        const angle = i * 0.7;
        return {
          x: shape.cx + shape.radius * Math.cos(angle),
          y: shape.cy + shape.radius * Math.sin(angle),
        };
      });
    case 'triangle':
    case 'polygon':
      return shape.points;
  }
}

/** Random points plus the hard ones: on vertices, edge midpoints, and just to either side of them. */
function testPoints(project: RegionProject): Point[] {
  let state = 12345;
  const random = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  const { lengthMeters: length, widthMeters: width } = project.field;
  const points: Point[] = [];
  for (let i = 0; i < 4000; i++) points.push({ x: random() * length, y: random() * width });

  for (const shape of project.regions.flatMap((region) => region.shapes)) {
    const vertices = shapeVertices(shape);
    vertices.forEach((vertex, i) => {
      const next = vertices[(i + 1) % vertices.length]!;
      const middle = { x: (vertex.x + next.x) / 2, y: (vertex.y + next.y) / 2 };
      for (const point of [vertex, middle]) {
        points.push(point);
        for (const offset of [1e-12, 1e-9, 1e-6]) {
          points.push({ x: point.x + offset, y: point.y }, { x: point.x, y: point.y - offset });
          // The mirror image, so red's flipped checks get exact edges too.
          points.push({ x: length - point.x, y: width - point.y + offset });
        }
        points.push(
          { x: length - point.x, y: width - point.y },
          { x: length - point.x, y: point.y },
        );
      }
    });
  }
  return points;
}

describe.skipIf(!hasJdk)('generated Java matches the preview', () => {
  const cases: [string, FieldSymmetry][] = [
    ['legacy', 'rotational'],
    ['legacy', 'mirrored'],
    ['modern', 'rotational'],
    ['modern', 'mirrored'],
  ];

  it.each(cases)(
    '%s profile on a %s field',
    (profileId, symmetry) => {
      const profile = JAVA_PROFILES[profileId as keyof typeof JAVA_PROFILES];
      const project = sampleProject(symmetry);
      const root = mkdtempSync(join(tmpdir(), 'regionbool-java-'));
      tempDirs.push(root);

      const generatedPath = `${project.output.packageName.replaceAll('.', '/')}/${project.output.className}.java`;
      const sources = [
        writeSource(root, generatedPath, generateJava(project, profile)),
        writeSource(root, 'Harness.java', harness(project, profile)),
        ...Object.entries(stubs(profile)).map(([path, source]) => writeSource(root, path, source)),
      ];

      const compile = spawnSync(
        'javac',
        ['--release', '17', '-Xlint:all', '-Werror', '-d', 'classes', ...sources],
        {
          cwd: root,
          encoding: 'utf8',
        },
      );
      expect(compile.status, compile.stderr).toBe(0);

      const points = testPoints(project);
      writeFileSync(join(root, 'points.txt'), points.map((p) => `${p.x} ${p.y}`).join('\n'));

      const run = spawnSync('java', ['-cp', 'classes', 'Harness', 'points.txt'], {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      });
      expect(run.status, run.stderr).toBe(0);

      const lines = run.stdout.trimEnd().split('\n');
      expect(lines).toHaveLength(points.length * ALLIANCES.length);

      let insideCount = 0;
      const mismatches: string[] = [];
      ALLIANCES.forEach((alliance, allianceIndex) => {
        points.forEach((point, pointIndex) => {
          const line = lines[allianceIndex * points.length + pointIndex]!;
          project.regions.forEach((region, regionIndex) => {
            const expected = regionContainsForAlliance(
              region,
              point.x,
              point.y,
              alliance,
              project.field,
            );
            if (expected) insideCount++;
            const fromTranslation = line[regionIndex * 2] === '1';
            const fromPose = line[regionIndex * 2 + 1] === '1';
            if (fromTranslation !== expected || fromPose !== expected) {
              mismatches.push(
                `${region.name} at (${point.x}, ${point.y}) on ${alliance}: preview ${expected}, Java ${fromTranslation}/${fromPose}`,
              );
            }
          });
        });
      });

      expect(mismatches.slice(0, 10)).toEqual([]);
      // Guards against a test that passes only because nothing is ever inside.
      expect(insideCount).toBeGreaterThan(1000);
    },
    60_000,
  );
});
