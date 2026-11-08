import { describe, expect, it } from 'vitest';
import {
  GENERATED_HEADER,
  generateJava,
  InvalidProjectError,
  javaDouble,
  normalizeJava,
} from '../../src/shared/codegen';
import { JAVA_PROFILES } from '../../src/shared/javaProfiles';
import type { RegionProject } from '../../src/shared/model';
import { sampleProject } from './fixtures/sampleProject';

const { legacy, modern } = JAVA_PROFILES;

describe('javaDouble', () => {
  it('always produces a double literal with the same value', () => {
    expect(javaDouble(5)).toBe('5.0');
    expect(javaDouble(0.1)).toBe('0.1');
    expect(javaDouble(-2.5)).toBe('-2.5');
    expect(javaDouble(-0)).toBe('-0.0');
    expect(javaDouble(1e-9)).toBe('1e-9');
    expect(javaDouble(1e21)).toBe('1e+21');
  });
});

describe('generateJava', () => {
  it('matches the saved output for each profile', async () => {
    await expect(generateJava(sampleProject(), legacy)).toMatchFileSnapshot(
      '__snapshots__/legacy.java.snap',
    );
    await expect(generateJava(sampleProject('mirrored'), modern)).toMatchFileSnapshot(
      '__snapshots__/modern.java.snap',
    );
  });

  it('converts center-origin poses before checking, and outlines back', async () => {
    const base = sampleProject();
    const project = { ...base, output: { ...base.output, fieldOrigin: 'center' as const } };
    const java = generateJava(project, modern);
    await expect(java).toMatchFileSnapshot('__snapshots__/center.java.snap');
    const half = (value: number) => javaDouble(value / 2);
    expect(java).toContain(
      `private static final double HALF_FIELD_LENGTH_METERS = ${half(base.field.lengthMeters)};`,
    );
    expect(java).toContain('double x = HALF_FIELD_LENGTH_METERS - point.getX();');
    expect(java).toContain('x = HALF_FIELD_LENGTH_METERS - x;');
    expect(java).toContain('origin at the\n * center of the field');
    expect(generateJava(base, modern)).not.toContain('HALF_FIELD');
  });

  it('starts with the header the safe writer relies on', () => {
    expect(generateJava(sampleProject(), legacy).startsWith(`${GENERATED_HEADER}\n`)).toBe(true);
  });

  it('is deterministic', () => {
    expect(generateJava(sampleProject(), legacy)).toBe(generateJava(sampleProject(), legacy));
  });

  it('generates both overloads for each region', () => {
    const java = generateJava(sampleProject(), legacy);
    for (const method of ['isInScoringZone', 'isInAreaDoCentro', 'isInSourceLane']) {
      expect(java).toContain(`public static boolean ${method}(Pose2d pose)`);
      expect(java).toContain(`public static boolean ${method}(Translation2d point)`);
    }
  });

  it("uses each profile's alliance API", () => {
    const legacyJava = generateJava(sampleProject(), legacy);
    expect(legacyJava).toContain('import edu.wpi.first.wpilibj.DriverStation.Alliance;');
    expect(legacyJava).toContain(
      'DriverStation.getAlliance().orElse(Alliance.Blue) == Alliance.Red',
    );
    const modernJava = generateJava(sampleProject(), modern);
    expect(modernJava).toContain('import org.wpilib.driverstation.MatchState;');
    expect(modernJava).toContain('MatchState.getAlliance().orElse(Alliance.BLUE) == Alliance.RED');
    expect(modernJava).not.toContain('edu.wpi.first');
  });

  it('flips y only on rotational fields', () => {
    expect(generateJava(sampleProject('rotational'), legacy)).toContain(
      'y = FIELD_WIDTH_METERS - y;',
    );
    expect(generateJava(sampleProject('mirrored'), legacy)).not.toContain('FIELD_WIDTH_METERS');
  });

  it('leaves out alliance code and unused helpers when they are not needed', () => {
    const project = sampleProject();
    project.regions = [
      {
        id: 'r',
        name: 'Zone',
        allianceMode: 'fixed',
        shapes: [{ id: 's', mode: 'add', kind: 'circle', cx: 1, cy: 1, radius: 1 }],
      },
    ];
    const java = generateJava(project, legacy);
    for (const unused of [
      'DriverStation',
      'isRedAlliance',
      'FIELD_LENGTH_METERS',
      'inRect',
      'inPolygon',
    ]) {
      expect(java).not.toContain(unused);
    }
    expect(java).toContain('inCircle');
  });

  it("includes a closed-path Field2d helper using each profile's imports", () => {
    const legacyJava = generateJava(sampleProject(), legacy);
    expect(legacyJava).toContain('import edu.wpi.first.wpilibj.smartdashboard.Field2d;');
    expect(legacyJava).toContain('public static void publishTo(Field2d field)');
    expect(legacyJava).toContain('new Pose2d[xs.length + 1]');
    expect(legacyJava).toContain('public static void publishToNetworkTables()');
    expect(legacyJava).toContain(
      'public static void forEachOutline(BiConsumer<String, Pose2d[]> consumer)',
    );
    expect(legacyJava).toContain('import edu.wpi.first.networktables.StructArrayPublisher;');
    expect(legacyJava).toContain('"isInAreaDoCentro 1 (hole)", false,');
    expect(legacyJava).toContain('"isInScoringZone 0", red,');
    expect(generateJava(sampleProject(), modern)).toContain(
      'import org.wpilib.smartdashboard.Field2d;',
    );
    expect(generateJava(sampleProject(), modern)).toContain(
      'import org.wpilib.networktables.StructArrayPublisher;',
    );
  });

  it('leaves alliance code out of the helper when no region flips', () => {
    const project = sampleProject();
    project.regions = project.regions.map((region) => ({ ...region, allianceMode: 'fixed' }));
    const java = generateJava(project, legacy);
    expect(java).not.toContain('boolean red');
    expect(java).not.toContain('boolean flip');
  });

  it('generates a usable class with no regions', () => {
    const project = sampleProject();
    project.regions = [];
    expect(generateJava(project, legacy)).toContain('public static void publishTo(Field2d field)');
  });

  it('refuses invalid projects', () => {
    const project: RegionProject = sampleProject();
    project.output.packageName = 'frc;System.exit(1);';
    expect(() => generateJava(project, legacy)).toThrow(InvalidProjectError);
  });

  it('cannot be broken out of a comment by a region name', () => {
    const project = sampleProject();
    project.regions[0]!.name = 'Zone */ static { evil(); } /* \\u000a evil(); " x';
    const java = generateJava(project, legacy);
    expect(java).not.toContain('*/ static');
    expect(java).not.toContain('\\u000a');
    expect(java).not.toContain('{ evil');
  });
});

describe('normalizeJava', () => {
  it('ignores what a formatter changes', () => {
    const generated = `// Header
/** A very long comment on one line. */
class A {
  void b() { call(1, new double[] {1.0, 2.0}); }
}
`;
    const formatted = `// Header
/**
 * A very long comment
 * on one line.
 */
class A {
  void b() {
    call(
        1,
        new double[] {
          1.0, 2.0
        });
  }
}
`;
    expect(normalizeJava(formatted)).toBe(normalizeJava(generated));
  });

  it('still notices a change to the code', () => {
    expect(normalizeJava('int a = 1;')).not.toBe(normalizeJava('int a = 2;'));
    expect(normalizeJava('call(x);')).not.toBe(normalizeJava('call(y);'));
  });

  it('keeps string contents, including spaces and comment-like text', () => {
    expect(normalizeJava('f("a b");')).not.toBe(normalizeJava('f("ab");'));
    expect(normalizeJava('f("a // b");')).toBe('f("a // b");');
    expect(normalizeJava('f("a /* b */ c");')).toBe('f("a /* b */ c");');
    expect(normalizeJava('f("say \\"hi\\" // x");')).toBe('f("say \\"hi\\" // x");');
  });

  it('removes comments outside strings', () => {
    expect(normalizeJava('int a; // note\n/* more */ int b;')).toBe('inta;intb;');
  });
});
