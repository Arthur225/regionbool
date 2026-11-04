# 0001: Generate one app-owned class

**Status:** accepted

## Decision

Generated code goes in a single class the app owns, by default `frc/robot/generated/FieldRegions.java`, with a configurable package and class name.

## Why

Regenerating a whole file is simple and can't damage hand-written code. Inserting into existing classes would need marker comments and more failure handling.

## Consequences

Teams call `FieldRegions.isInX(...)` rather than a method on their own class. The app refuses to overwrite a file lacking its header.
