# Data model

The types are in `src/shared/model.ts`, and `schemas/regions.schema.json` describes the file format. Each robot project stores its regions in `.regionbool/regions.json`.

## Coordinates

All positions and lengths use WPILib field coordinates in meters: the origin is at the blue alliance wall, +x points toward red, and +y points to the left as seen from blue. Pixels exist only in the rendering layer.

## Structure

```
RegionProject
├── version          File format version, currently 1
├── field            lengthMeters, widthMeters, symmetry
├── output           packageName, className
└── regions[]
    ├── id, name
    ├── allianceMode  fixed | alliance-relative
    └── shapes[]      each has id, mode (add | subtract), kind
```

| Kind       | Fields                                       | Notes                                                    |
| ---------- | -------------------------------------------- | -------------------------------------------------------- |
| `rect`     | `cx`, `cy`, `width`, `height`, `rotationDeg` | Rotates counterclockwise about its center                |
| `circle`   | `cx`, `cy`, `radius`                         |                                                          |
| `triangle` | `points` (exactly 3)                         | Has no stored rotation: rotating one rewrites its points |
| `polygon`  | `points` (3 or more)                         | May be concave. Don't repeat the first point at the end  |

## Rules for "inside"

`src/shared/geometry.ts` defines these, and generated Java follows them exactly:

- A point is in a region if it's in at least one adding shape and in no subtracting shape.
- Shape order doesn't matter.
- Edges count as inside a shape, within `EDGE_TOLERANCE_METERS` (1e-9). So a point exactly on a hole's edge is outside the region.
- Polygons use the even-odd rule. A self-crossing polygon is allowed but produces a warning.

## Alliance behavior

- `fixed` regions never change.
- `alliance-relative` regions are drawn from blue's side. On red, the queried point is flipped before testing, according to `field.symmetry`:
  - `rotational`: `(L-x, W-y)`
  - `mirrored`: `(L-x, y)`
- An unknown alliance counts as blue.

## Validation

There are two layers, because files can be edited by hand or come from anywhere:

1. **The JSON schema** checks structure: required fields, types and allowed values. It will run on load once saving is added in build step 5.
2. **`validateProject`** checks meaning: Java names, duplicate methods, shape sizes, and regions with no adding shape. Errors block code generation, and warnings are only shown to the user.

## Method names

`toMethodName` builds names from the display name, such as "Área de score" becoming `isInAreaDeScore`. Accents are removed, and other non-alphanumeric characters separate words. Names with no ASCII letters or digits, such as "区域", are rejected. Generated names are ASCII so source file encoding can't cause problems.

## Changing the format

Any change to `RegionProject` needs matching updates to the schema and this page. After the first public release, incompatible changes must also increase `REGIONS_FILE_VERSION` and add a migration.
