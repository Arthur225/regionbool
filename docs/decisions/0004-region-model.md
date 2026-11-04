# 0004: Model regions as unions with holes

**Status:** accepted

## Decision

A region is a list of rectangles, circles, triangles and polygons, each either adding area or subtracting it. All shapes can be rotated.

## Why

This covers shapes like an L-shaped zone or a zone around a field element, without needing a general polygon boolean library.

## Consequences

`inside = (any add-shape contains p) && !(any hole contains p)`. Edges count as inside a shape, so a point exactly on a hole's edge is outside the region.
