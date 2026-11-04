import { describe, expect, it } from 'vitest';
import {
  GENERATED_HEADER,
  generateJava,
  InvalidProjectError,
  javaDouble,
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
