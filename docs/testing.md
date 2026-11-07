# Testing

| Layer            | Files                                | What it proves                                                                   | Needs            |
| ---------------- | ------------------------------------ | -------------------------------------------------------------------------------- | ---------------- |
| Geometry         | `tests/unit/geometry.test.ts`        | Edges, rotation, concave polygons, holes and flips behave as specified           | Node             |
| Model            | `tests/unit/model.test.ts`           | Name conversion and validation rules                                             | Node             |
| Schema           | `tests/unit/schema.test.ts`          | The schema accepts saved projects and rejects corrupted ones                     | Node             |
| Codegen          | `tests/unit/codegen.test.ts`         | Output content, snapshots for each profile, injection safety                     | Node             |
| Java cross-check | `tests/unit/java-crosscheck.test.ts` | Compiled Java and `geometry.ts` agree on every point                             | A JDK            |
| Real WPILib      | `tests/unit/java-wpilib.test.ts`     | Generated code compiles against real WPILib jars                                 | A WPILib install |
| Docs             | `tests/unit/docs.test.ts`            | The `AGENTS.md` map and decisions index aren't stale                             | Node             |
| End to end       | `tests/e2e/`                         | The real app launches securely, opens projects, and the export flow reaches disk | Built app        |

`npm run check` runs everything except the end-to-end and packaged tests. `npm run test:e2e` and `npm run test:packaged` run those. `.github/workflows/release.yml` runs all of them on Windows, macOS and Linux, but only for tags and pull requests that change packaging.

## Java cross-check

This is the main protection against generated code drifting from the rules in `docs/data-model.md`. For both profiles and both field symmetries, it does the following:

1. Generates the class from a project using every shape type, mode and alliance behavior.
2. Compiles it with `javac --release 17 -Xlint:all -Werror`, using small stubs in place of WPILib.
3. Runs it over about 4,000 random points, plus points on and just beside each shape's vertices and edge midpoints, and their flipped positions.
4. Compares each answer with `geometry.ts` for blue, red and an unknown alliance, through both overloads.
5. Runs `publishTo` and `publishToNetworkTables` on each alliance and compares every outline point with the TypeScript.

Stubs are used so the test only needs a JDK. If the real API changes, the stubs won't notice, which is why the real WPILib test exists.

## Skipped tests

These tests skip rather than fail when their requirements are missing, so **a skip means unverified, not passing**. Check the output for skips when changing codegen or profiles:

- The Java cross-check skips without `javac` on the `PATH`.
- The real WPILib tests look in `~/wpilib` installs, using each install's own JDK, then the Gradle cache. They skip if neither has those jars. CI has no WPILib install, so they only run on developers' machines.
- The `modern` real WPILib test also skips if it only finds a JDK too old to read the jars. 2027 jars need Java 25, which WPILib's 2027 install includes.

## Manual checks

**Field image orientation can't be fully automated.** When adding or changing a bundled image, follow the check in `docs/fields.md`: draw the AprilTag positions over it and look.

These tests only compile. To run generated code against real WPILib, add a JUnit test to a copy of a robot project and run `./gradlew test`, using `JAVA_HOME=~/wpilib/<install>/jdk`. Initialize the HAL and set the alliance with `DriverStationSim`. The APIs differ between versions: 2027 alpha-8 uses `org.wpilib.hardware.hal.HAL.initialize()` with no arguments and `AllianceStationID.RED_1`, while 2026 uses `HAL.initialize(500, 0)` and `AllianceStationID.Red1`.

End-to-end tests replace `dialog.showOpenDialog` because a native dialog can't be driven by a test, so the real dialog is only exercised by hand.

Playwright's debugger connection intercepts the close prompt, so `unsaved-prompt.spec.ts` launches Electron directly, using `unsaved-prompt-main.cjs`. To reset the editor in other tests, use `freshPage` from `helpers.ts`, which reloads without triggering the prompt.

After changing generated code, it's worth a real check in a copy of a robot project, because stubs can't show how real WPILib and formatters behave: run `./gradlew spotlessApply` if the project uses Spotless, then a JUnit test that calls the generated methods, as in decision 0015.
