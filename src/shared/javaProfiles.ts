/**
 * What differs between WPILib versions in the code RegionBool generates.
 *
 * The WPILib year doesn't decide this: a 2027 alpha-1 project still used `edu.wpi.first.*`, while
 * alpha-6 uses `org.wpilib.*`. Checked against the WPILib 2026.2.1 jars, the 2027.0.0-alpha-8 jars and the 2027.0.0-alpha-6
 * sources. See `docs/codegen.md` for how to add or update a profile.
 */

/** Identifies a {@link JavaProfile}. */
export type JavaProfileId = 'legacy' | 'modern';

/** Everything generated code needs that depends on the WPILib version. */
export interface JavaProfile {
  id: JavaProfileId;
  /** Short description for the UI. */
  label: string;
  /** Imports needed by every generated class. */
  geometryImports: readonly string[];
  /** Imports needed only when a region is alliance-relative. */
  allianceImports: readonly string[];
  /** Imports for the Field2d helper, which every generated class has. */
  field2dImports: readonly string[];
  /** Imports for publishing outlines as struct arrays, which every generated class does. */
  networkTablesImports: readonly string[];
  /** A boolean Java expression that's true on red and false on blue or an unknown alliance. */
  isRedExpression: string;
}

/** The profiles the generator supports. */
export const JAVA_PROFILES: Readonly<Record<JavaProfileId, JavaProfile>> = {
  legacy: {
    id: 'legacy',
    label: 'WPILib 2025, 2026 and early 2027 alphas (edu.wpi.first)',
    geometryImports: [
      'edu.wpi.first.math.geometry.Pose2d',
      'edu.wpi.first.math.geometry.Rotation2d',
      'edu.wpi.first.math.geometry.Translation2d',
    ],
    allianceImports: [
      'edu.wpi.first.wpilibj.DriverStation',
      'edu.wpi.first.wpilibj.DriverStation.Alliance',
    ],
    field2dImports: ['edu.wpi.first.wpilibj.smartdashboard.Field2d'],
    networkTablesImports: [
      'edu.wpi.first.networktables.NetworkTableInstance',
      'edu.wpi.first.networktables.StructArrayPublisher',
    ],
    isRedExpression: 'DriverStation.getAlliance().orElse(Alliance.Blue) == Alliance.Red',
  },
  modern: {
    id: 'modern',
    label: 'WPILib 2027 alpha-6 and newer (org.wpilib)',
    geometryImports: [
      'org.wpilib.math.geometry.Pose2d',
      'org.wpilib.math.geometry.Rotation2d',
      'org.wpilib.math.geometry.Translation2d',
    ],
    allianceImports: ['org.wpilib.driverstation.Alliance', 'org.wpilib.driverstation.MatchState'],
    field2dImports: ['org.wpilib.smartdashboard.Field2d'],
    networkTablesImports: [
      'org.wpilib.networktables.NetworkTableInstance',
      'org.wpilib.networktables.StructArrayPublisher',
    ],
    isRedExpression: 'MatchState.getAlliance().orElse(Alliance.BLUE) == Alliance.RED',
  },
};
