# 0014: Bundle WPILib's field images, with license unconfirmed

**Status:** accepted. The owner made the repository public on 2026-11-04 with the images included and the license question still open. Publishing installers is blocked until it's resolved.

## Decision

Field images and sizes for 2022 to 2026 come from WPILib's allwpilib repository, pinned to one commit and recorded in `resources/fields/SOURCES.md`. Each definition states whether its image has to be turned, and symmetry was worked out from AprilTag positions.

## Why

WPILib is the most authoritative source, and the only one found with a 2026 image. Its data also shows things that matter: 2025 and 2026 have welded and AndyMark variants with different sizes, which changes where flipped regions land.

## Consequences

- **License:** allwpilib is under a BSD license, but it doesn't clearly say the images are covered. It credits the 2024 image to a Chief Delphi author, and the images depict FIRST field designs. Before publishing installers, either confirm the terms with WPILib and the authors, or drop the images and rely on import. The images are in the public git history, so removing them fully would take a history rewrite. The blank-grid fallback means the app still works without them.
- **Orientation:** WPILib's images show red on the left while its coordinates put blue at x = 0, so they're turned at display time. A future WPILib change could alter this, so re-check by eye when updating them.
- **Seasons before 2022** aren't included, because they have no AprilTags to confirm symmetry from.
