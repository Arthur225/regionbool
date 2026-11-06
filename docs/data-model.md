# Data model

The types are in `src/shared/model.ts`, and `schemas/regions.schema.json` describes the file format. Each robot project stores its regions in `.regionbool/regions.json`.

## Coordinates

All positions and lengths use WPILib field coordinates in meters: the origin is at the blue alliance wall, +x points toward red, and +y points to the left as seen from blue. Pixels exist only in the rendering layer.

## Structure

```
RegionProject
├── version          File format version, currently 1
├── field            lengthMeters, widthMeters, symmetry, fieldId (optional)
├── output           packageName, className, javaProfile (optional)
├── generatedHash    Hash of the last exported file (optional, see below)
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

1. **The JSON schema** checks structure: required fields, types and allowed values. It runs on load, on save and on export.
2. **`validateProject`** checks meaning: Java names, duplicate methods, shape sizes, and regions with no adding shape. Errors block code generation, and warnings are only shown to the user.

## Saving

`src/main/regionsFile.ts` reads and writes the file. Teams commit it, so it may be edited by hand or come from a merge.

- **A file that can't be understood is never overwritten.** That covers broken JSON, a schema failure and a newer version. The app shows why, and saving and exporting are refused until someone fixes or removes the file.
- **`fieldId`** names the field definition in use. Changing the size by hand removes it, because the image would no longer match. If the definition can't be found, the saved size and symmetry still apply, on a blank grid.
- **`javaProfile`** is the WPILib API chosen in the export dialog. Without it, the app detects one.
- **`generatedHash`** is a SHA-256 of the Java code from the last export, ignoring comments and formatting, used to notice hand edits. The main process owns it: it never goes to the renderer, and any value the renderer sends is ignored.
- **Formatting is stable,** with 2-space indentation and a final newline, so git diffs stay readable.

The app doesn't notice this file changing while it's open, such as from a `git pull`. The next save replaces it, so reopen the project after pulling.

## Method names

`toMethodName` builds names from the display name, such as "Área de score" becoming `isInAreaDeScore`. Accents are removed, and other non-alphanumeric characters separate words. Names with no ASCII letters or digits, such as "区域", are rejected. Generated names are ASCII so source file encoding can't cause problems.

## Changing the format

Any change to `RegionProject` needs matching updates to the schema and this page. After the first public release, incompatible changes must also increase `REGIONS_FILE_VERSION` and add a migration.
