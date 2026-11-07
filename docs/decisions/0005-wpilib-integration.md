# 0005: Limit WPILib integration in v1

**Status:** accepted

## Decision

Version 1 includes project detection and a generated Field2d helper. Live NT4 pose, generated unit tests and an open-in-VS-Code button are left out.

## Why

These were the features chosen for the first version. Checking regions happens through generated tests and live values in a dashboard.

## Consequences

Region outlines can still be seen in AdvantageScope, Glass or Elastic through Field2d.
