# 0018: Offer a field-center coordinate option

**Status:** accepted

## Decision

Each project chooses the robot code's field coordinate system: origin at the blue corner (+x toward red), or at the center of the field (+x toward blue). Regions stay stored in blue-corner coordinates. The editor converts the numbers it shows, and the generated class converts poses before checking them.

## Why

WPILib is moving to a center-origin system, which is the old one turned 180° about the center. Poses don't say which system they use, so a class built for the wrong one would give wrong answers with no error. The owner chose a plain option over detecting the system from the WPILib version, because it isn't known which version makes the change.

## Consequences

Saved files stay compatible: `fieldOrigin` is optional and defaults to `blue-corner`, so the file version doesn't change. Switching the option never rewrites shapes. Center-origin checks do two extra subtractions and still don't allocate.
