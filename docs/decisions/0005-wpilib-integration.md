# 0005: Limit WPILib integration in v1

**Status:** accepted

## Decision

Version 1 includes project detection and a generated Field2d helper. Live NT4 pose, generated unit tests and an open-in-VS-Code button are left out.

## Why

These were the features chosen for the first version. A point-tester tool gives a way to check regions without a robot connection.

## Consequences

Region outlines can still be seen in AdvantageScope, Glass or Elastic through Field2d.
