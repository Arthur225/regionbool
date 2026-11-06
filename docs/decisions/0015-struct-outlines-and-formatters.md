# 0015: Publish struct outlines, and ignore formatting in hand-edit checks

**Status:** accepted

## Decision

Generated classes publish outlines as `Pose2d` struct arrays through `publishToNetworkTables()`, and also keep `publishTo(Field2d)`. `forEachOutline` exposes the same data to a team's own logger. Hand-edit detection and the `unchanged` status compare Java with comments and whitespace removed.

## Why

Both came from trying the app on a real robot project. AdvantageScope warned that `Field2d`'s numeric array format is deprecated and will be removed in 2027, and WPILib's `Field2d` always uses that format. Glass and Elastic still read `Field2d`, so it stays.

That project's `./gradlew build` also runs Spotless, which reformats the generated class. Every export would then have warned about hand edits that never happened. Teams commonly use formatters, and matching each one's output isn't practical.

## Consequences

Comment-only edits aren't detected, because they don't change behavior. The export diff compares text, so a reformatted file can show line-break noise alongside real changes.

Hashes saved by older versions were of the exact text, so a project exported before this change gets one false hand-edit warning on its next export. No version has been released, so there's no migration.

Verified on a copy of a real 2026 project: real Spotless output normalizes to the generated code, and a JUnit test read the outlines back from real NetworkTables as `struct:Pose2d[]` on both alliances. The `modern` API was only checked against current WPILib sources.
