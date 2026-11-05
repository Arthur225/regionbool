# Fields

A field definition gives a field's size and symmetry, and how its image maps to field coordinates. The parser is in `src/shared/fields.ts`, and `src/main/fields.ts` loads the files.

## Where they come from

| Folder                             | Contents                         | Status                      |
| ---------------------------------- | -------------------------------- | --------------------------- |
| `resources/fields/`                | Fields bundled with the app      | Empty until build step 6    |
| `.regionbool/fields/` in a project | Images imported for that project | From **Import field image** |

If the same id appears in both, the project's version wins. Packaged apps will read bundled fields from Electron's resources folder.

## File format

Each field is `<id>.json` next to its image. The format is the one Elastic ships with two additions, `symmetry` and `image-rotated`:

```json
{
  "game": "Reefscape",
  "field-image": "2025-field.png",
  "field-corners": { "top-left": [421, 91], "bottom-right": [3352, 1437] },
  "field-size": [17.548, 8.052],
  "symmetry": "rotational",
  "image-rotated": true
}
```

| Key             | Meaning                                                                             |
| --------------- | ----------------------------------------------------------------------------------- |
| `game`          | Display name. Defaults to the id                                                    |
| `field-image`   | Image file, PNG or JPEG. Any folders in the path are ignored                        |
| `field-corners` | Pixel positions of the field's corners within the image                             |
| `field-size`    | `[length, width]` in meters                                                         |
| `image-rotated` | `true` if the image shows red on the left, so it's turned 180° to match coordinates |
| `symmetry`      | `rotational` or `mirrored`. If missing, the user has to choose (see below)          |

Other keys, such as Elastic's `source-url`, are ignored.

## Safety

Definitions can come from a robot project, so they're treated as untrusted. Field ids can't contain path characters, images are read only from the definition's own folder, invalid files are skipped rather than failing the list, and images over 32 MB are refused.

## Symmetry

Symmetry decides how alliance-relative regions flip, so a wrong value gives wrong answers on red. Don't guess: for seasons with AprilTags, work it out from the tag positions. For each tag, see whether another tag sits at the rotated position `(L-x, W-y)` or the mirrored position `(L-x, y)`. A rotationally symmetric season matches for every tag. A missing value is `null`, and the app then keeps the current setting.

## Image orientation

**Getting this wrong makes the app actively misleading,** because users would draw on what looks like the blue side while generated code checks the opposite end. Rotationally symmetric fields look almost right either way, and only the colors give it away, so tests alone can't catch it.

WPILib field coordinates put blue at x = 0, which the canvas draws on the left. Images don't agree on this: WPILib's current images show red on the left, while Elastic's copy of 2024 shows blue on the left.

## Adding a season

1. Add the image and `<id>.json` to `resources/fields/`. Take the size and corners from WPILib's `fields/` folder, converting `left`, `top`, `right` and `bottom` into `field-corners`.
2. Work out `symmetry` from the AprilTags, as above.
3. Set `image-rotated`, then **check it by eye**: draw the season's AprilTag positions over the image, and confirm each lands on the right feature with blue on the left.
4. If there are variants with different sizes, such as welded and AndyMark fields, add one definition for each. They can share an image. The size matters, because flipping uses it.
5. Record the source and license status in `resources/fields/SOURCES.md`. `tests/unit/bundledFields.test.ts` checks that it's listed.

## Image licenses

[`resources/fields/SOURCES.md`](../resources/fields/SOURCES.md) records each image's source. **Their license is unconfirmed, and this must be resolved before any public release** (see decision 0014). A test keeps that warning in place, so removing it has to be deliberate.
