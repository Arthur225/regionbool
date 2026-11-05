# Fields

A field definition gives a field's size and symmetry, and how its image maps to field coordinates. The parser is in `src/shared/fields.ts`, and `src/main/fields.ts` loads the files.

## Where they come from

| Folder                             | Contents                         | Status                           |
| ---------------------------------- | -------------------------------- | -------------------------------- |
| `resources/fields/`                | Fields bundled with the app      | Empty until build step 6         |
| `.regionbool/fields/` in a project | Images imported for that project | Read now, import comes in step 6 |

If the same id appears in both, the project's version wins. Packaged apps will read bundled fields from Electron's resources folder.

## File format

Each field is `<id>.json` next to its image. The format is the one Elastic ships with one addition, `symmetry`:

```json
{
  "game": "Reefscape",
  "field-image": "2025-field.png",
  "field-corners": { "top-left": [421, 91], "bottom-right": [3352, 1437] },
  "field-size": [17.548, 8.052],
  "symmetry": "rotational"
}
```

| Key             | Meaning                                                                    |
| --------------- | -------------------------------------------------------------------------- |
| `game`          | Display name. Defaults to the id                                           |
| `field-image`   | Image file, PNG or JPEG. Any folders in the path are ignored               |
| `field-corners` | Pixel positions of the field's corners within the image                    |
| `field-size`    | `[length, width]` in meters                                                |
| `symmetry`      | `rotational` or `mirrored`. If missing, the user has to choose (see below) |

Other keys, such as Elastic's `source-url`, are ignored.

## Safety

Definitions can come from a robot project, so they're treated as untrusted. Field ids can't contain path characters, images are read only from the definition's own folder, invalid files are skipped rather than failing the list, and images over 32 MB are refused.

## Symmetry

Symmetry decides how alliance-relative regions flip, so a wrong value gives wrong answers on red. Check it against the season's game manual rather than guessing. A missing value is deliberately `null`, so the UI has to ask instead of assuming.

## Image licenses

Bundled images will be recorded here in build step 6, with each image's source and license. No images are bundled yet.
