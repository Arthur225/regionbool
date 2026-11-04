# 0003: Choose alliance behavior per region

**Status:** accepted

## Decision

Each region is either field-fixed or alliance-relative. Alliance-relative regions are drawn from blue's side, and on red the queried point is flipped before testing.

## Why

Some areas belong to one physical side of the field, while others depend on your alliance, so one global rule would be wrong for one group. Flipping the point rather than the region keeps checks free of allocation.

## Consequences

The flip depends on each season's symmetry: rotational `(L-x, W-y)` or mirrored `(L-x, y)`. If the alliance is unknown the code treats it as blue, as documented in the generated Javadoc.
