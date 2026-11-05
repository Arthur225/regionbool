# 0007: Bundle field images, with custom import

**Status:** accepted, with sources and orientation updated by [0014](0014-field-image-sources.md)

## Decision

Field images and dimensions ship with the app, and users can import an image and mark its corners. Without an image, the app shows a blank grid at the right dimensions.

## Why

WPILib has field images only as private files inside Elastic, at a path that varies by OS, and the inspected 2026 install had no 2026 field. Elastic's JSON format, with field size in meters and corners in pixels, is still worth reusing.

## Consequences

Each bundled image's license must be checked before a public release, and any that can't be cleared are dropped. A new season needs an app update or an import.
