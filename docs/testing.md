# Testing

| Layer            | Files                                | What it proves                                                                   | Needs       |
| ---------------- | ------------------------------------ | -------------------------------------------------------------------------------- | ----------- |
| Geometry         | `tests/unit/geometry.test.ts`        | Edges, rotation, concave polygons, holes and flips behave as specified           | Node        |
| Model            | `tests/unit/model.test.ts`           | Name conversion and validation rules                                             | Node        |
| Schema           | `tests/unit/schema.test.ts`          | The schema accepts saved projects and rejects corrupted ones                     | Node        |
| Codegen          | `tests/unit/codegen.test.ts`         | Output content, snapshots for each profile, injection safety                     | Node        |
| Java cross-check | `tests/unit/java-crosscheck.test.ts` | Compiled Java and `geometry.ts` agree on every point                             | A JDK       |
| Real WPILib      | `tests/unit/java-wpilib.test.ts`     | Generated code compiles against real WPILib jars                                 | Cached jars |
| Docs             | `tests/unit/docs.test.ts`            | The `AGENTS.md` map and decisions index aren't stale                             | Node        |
| End to end       | `tests/e2e/`                         | The real app launches securely, opens projects, and the export flow reaches disk | Built app   |

`npm run check` runs everything except the end-to-end tests, and `npm run test:e2e` runs those.

## Java cross-check

This is the main protection against the preview showing one thing while the robot does another. For both profiles and both field symmetries, it does the following:

1. Generates the class from a project using every shape type, mode and alliance behavior.
2. Compiles it with `javac --release 17 -Xlint:all -Werror`, using small stubs in place of WPILib.
3. Runs it over about 4,000 random points, plus points on and just beside each shape's vertices and edge midpoints, and their flipped positions.
4. Compares each answer with `geometry.ts` for blue, red and an unknown alliance, through both overloads.
5. Runs `publishTo` on each alliance and compares every outline point with the TypeScript.

Stubs are used so the test only needs a JDK. If the real API changes, the stubs won't notice, which is why the real WPILib test exists.

## Skipped tests

These tests skip rather than fail when their requirements are missing, so **a skip means unverified, not passing**. Check the output for skips when changing codegen or profiles:

- The Java cross-check skips without `javac` on the `PATH`.
- The real WPILib tests skip if the Gradle cache doesn't have those jars. The Gradle cache is filled by building a robot project of that version.
- The `modern` real WPILib test also skips if the JDK is too old to read the jars. 2027 alpha-6 jars need Java 25.

## Manual checks

**Field image orientation can't be fully automated.** When adding or changing a bundled image, follow the check in `docs/fields.md`: draw the AprilTag positions over it and look.

`modern` real compile needs JDK 25. To run it, put a JDK 25 `javac` on your `PATH`, have a built alpha-6 project in the Gradle cache, and run `npm test`. Confirm the test shows as passed rather than skipped.

End-to-end tests replace `dialog.showOpenDialog` because a native dialog can't be driven by a test, so the real dialog is only exercised by hand.

Playwright's debugger connection intercepts the close prompt, so `unsaved-prompt.spec.ts` launches Electron directly, using `unsaved-prompt-main.cjs`. To reset the editor in other tests, use `freshPage` from `helpers.ts`, which reloads without triggering the prompt.
