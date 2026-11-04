# 0002: Generate Pose2d and Translation2d overloads

**Status:** accepted

## Decision

Each region gets a method taking `Pose2d` and one taking `Translation2d`.

## Why

Most callers have a robot pose, but regions are also useful for other points, such as a game piece. Rotation doesn't affect the check, so the `Pose2d` version just delegates.

## Consequences

The class has two methods per region, and only the `Translation2d` one holds logic.
