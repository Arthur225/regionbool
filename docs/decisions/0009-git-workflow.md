# 0009: Use one branch and pull request per build step

**Status:** accepted

## Decision

Each build step gets its own branch and pull request, which a person reviews and merges before the next step starts.

## Why

This gives the owner a review point for each part of the app.

## Consequences

Work pauses at each pull request until it's merged or the owner says to continue.
