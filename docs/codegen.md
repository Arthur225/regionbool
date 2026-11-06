# Code generation

`generateJava(project, profile)` in `src/shared/codegen.ts` turns a project into a Java class. It's a pure function, and it refuses projects with validation errors.

## Generated class layout

1. The header line (`GENERATED_HEADER`), which the writer will use to avoid overwriting hand-written files
2. Package and imports, including alliance imports only if a region needs them
3. Private constants: the edge tolerance, field size if flipping needs it, and one pair of arrays per polygon
4. Two public methods per region, taking `Pose2d` and `Translation2d`. The `Pose2d` one delegates
5. `publishToNetworkTables()`, `publishTo(Field2d)` and `forEachOutline(consumer)`, which expose the outlines (see below)
6. Private helpers, only those the project uses: `isRedAlliance`, `inRect`, `inCircle`, `inPolygon`, plus `acceptOutline`

## Publishing outlines

Each shape has an outline: a closed path of poses, named like `isInScoringZone 0` or `isInScoringZone 1 (hole)`. Circles become 32-sided polygons, so that outline only approximates what the check uses, and a hole appears as an outline rather than a cutout. There are three ways to get them:

| Method                     | Use for             | Format                                                                                          |
| -------------------------- | ------------------- | ----------------------------------------------------------------------------------------------- |
| `publishToNetworkTables()` | AdvantageScope      | `Pose2d` struct arrays under `RegionBool/`                                                      |
| `publishTo(Field2d)`       | Glass, Elastic      | WPILib's `Field2d`, a plain `double[]` that AdvantageScope says it will stop supporting in 2027 |
| `forEachOutline(consumer)` | A team's own logger | Whatever the consumer does                                                                      |

All of them allocate, so they're meant for startup or when the alliance changes, not every loop. Alliance-relative shapes use the alliance at the time of the call.

## Formatters

Teams often run Spotless or google-java-format over their whole project, including the generated class. Matching any formatter's output exactly isn't practical, so `normalizeJava` removes comments and whitespace outside strings, and comparisons use that:

- A file that only differs in formatting counts as `unchanged`, and isn't rewritten.
- The hash in `regions.json` is of the normalized code, so reformatting doesn't look like a hand edit.
- A comment-only edit isn't detected, since it doesn't change behavior.

The export diff still compares text, so a reformatted file shows line-break differences when something else changed. The dialog says so.

## Rules

- **Formulas match `geometry.ts` exactly.** A change in one needs the same change in the other, and `tests/unit/java-crosscheck.test.ts` proves they agree.
- **Numbers keep their exact value.** JavaScript prints the shortest text that reads back as the same double, so `javaDouble` output is identical in Java. A rectangle's sine and cosine are embedded rather than computed, because `Math.cos` can round differently between languages.
- **Region checks don't allocate.** This doesn't apply to the methods that publish outlines. Polygon vertices live in constants, and checks use primitive math. The one exception is outside our control: for alliance-relative regions, WPILib's `getAlliance()` returns an `Optional`.
- **Output is deterministic,** with no timestamps, so regenerating produces clean diffs.
- **Project text can't inject code.** Package and class names must pass validation, method names contain only ASCII letters and digits, and `commentSafe` reduces region names to plain ASCII before they go in comments. That removes backslashes too, because Java reads unicode escapes like `\u000a` even inside comments.
- **Generated code stays within Java 17,** which is the lowest version the supported projects use. 2027 alphas require a newer JDK, but Java 17 source compiles there too.

## Import profiles

A profile (`src/shared/javaProfiles.ts`) holds everything that depends on the WPILib version. The WPILib year doesn't decide the profile, so project detection reads the project's existing imports, and the export dialog asks when they aren't conclusive.

| Item             | `legacy` (2025, 2026, early 2027 alpha)                 | `modern` (2027 alpha-6 and newer)               |
| ---------------- | ------------------------------------------------------- | ----------------------------------------------- |
| Geometry package | `edu.wpi.first.math.geometry`                           | `org.wpilib.math.geometry`                      |
| Alliance type    | `edu.wpi.first.wpilibj.DriverStation.Alliance` (nested) | `org.wpilib.driverstation.Alliance` (top-level) |
| Alliance values  | `Alliance.Red`, `Alliance.Blue`                         | `Alliance.RED`, `Alliance.BLUE`                 |
| Getting alliance | `DriverStation.getAlliance()`                           | `MatchState.getAlliance()`                      |

The 2027 API is still in alpha and may change again. We haven't determined which alpha switched from one profile to the other.

## Adding or updating a profile

1. Read the WPILib jars or `-sources` jars in `~/.gradle/caches/modules-2/files-2.1`. Don't rely on memory, as these APIs do move.
2. Update `JavaProfileId` and `JAVA_PROFILES`.
3. Update the stubs in `tests/unit/java-crosscheck.test.ts` to match the real signatures, and add the profile to the test cases there and in `java-wpilib.test.ts`.
4. Run `npm test`. If output changed on purpose, review the snapshot diff in `tests/unit/__snapshots__/`, then update it with `npx vitest run -u`.
5. Update the table above.
