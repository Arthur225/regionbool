# 0006: Detect WPILib imports from the project

**Status:** accepted

## Decision

The import profile is taken from imports already in the project's `src/main/java`, falling back to the GradleRIO plugin and version, with a manual override.

## Why

The WPILib year doesn't determine the package names. A 2027 alpha-1 project was found still importing `edu.wpi.first.*`, while cached alpha-6 jars use `org.wpilib.*`, `Alliance` moved from a nested class to a top-level class with uppercase values, and `getAlliance()` moved from `DriverStation` to `MatchState`.

## Consequences

Two profiles exist, legacy and modern. Further alpha changes may need more profiles, or edits to the existing ones. Compiling against alpha-6 jars needs JDK 25, because they are Java 25 class files.
