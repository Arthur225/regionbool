# 0006: Detect WPILib imports from the project

**Status:** accepted

## Decision

The import profile is taken from imports already in the project's `src/main/java`, falling back to the GradleRIO plugin and version, with a manual override.

## Why

The WPILib year doesn't determine the package names. A 2027 alpha-1 project was found still importing `edu.wpi.first.*`, while cached alpha-6 jars use `org.wpilib.*`, and `Alliance` moved from a nested class to a top-level class.

## Consequences

Two profiles exist, legacy and modern. Further alpha changes may need more profiles, or edits to the existing ones.
