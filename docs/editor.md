# Editor

The renderer has three parts: `store.ts` holds the state, `canvas/FieldCanvas.tsx` turns pointer input into changes, and `panels/` shows and edits the same state.

## Look

Colors are CSS variables at the top of `styles.css`, taken from the team's logos: team navy and blue, with the team's yellow as a highlight. The top and bottom bars stay navy in both light and dark mode. The Team 1156 logo is white on a transparent background, so it works on any bar color. Barlow and JetBrains Mono are bundled through `@fontsource`, so the app needs no network at competitions. Field images keep square corners, and region outlines stay exact, because their corners are the real boundaries.

The app icon is `build/icon.svg`, a drawn region with a point inside it. `build/icon.png` is its 1024 px render, which electron-builder turns into each system's icon format. If you change the SVG, render the PNG again.

## Coordinates

The SVG's `viewBox` is in meters, so shapes are drawn at their real coordinates and the browser handles scaling. WPILib's +y points up the screen and SVG's points down, so `sy(y) = width - y` is the only conversion. Rectangles are drawn from `rectCorners` as polygons rather than with SVG transforms, which keeps rotation in one place.

Handles and labels need a constant size on screen, so their sizes are divided by `pixelsPerMeter`, which is measured from the SVG.

## State

| State                                     | In undo history |
| ----------------------------------------- | --------------- |
| `doc`: the regions, field and output      | Yes             |
| Selection, tool, draw mode, snap settings | No              |
| Half-drawn polygon, cursor                | No              |

`doc` is never mutated, so each undo step is just a reference to an earlier version. `beginGesture` and `endGesture` make one undo step out of many changes, which is used for drags and for typing in a region name. `undo` clears a selection that no longer exists.

## Interaction

| Tool          | Input                                                               |
| ------------- | ------------------------------------------------------------------- |
| Select (V)    | Drag a shape to move it, and drag handles to resize or rotate it    |
| Rectangle (R) | Drag between two corners                                            |
| Circle (C)    | Drag from the center to the edge                                    |
| Triangle (T)  | Click 3 points                                                      |
| Polygon (P)   | Click points. Finish with a double-click, Enter, or the first point |

Other keys: Esc cancels and returns to Select, Delete removes the selected shape, Cmd/Ctrl+Z undoes, and Cmd/Ctrl+Shift+Z or Ctrl+Y redoes. Shortcuts are ignored while typing in a field. On a selected polygon, double-clicking an edge adds a point and double-clicking a point removes it.

Things to know when changing the canvas:

- **Gestures keep their starting shape.** Each pointer move recalculates from it rather than adding to the current shape, so rounding can't accumulate.
- **Pointer capture changes event targets.** After `setPointerCapture`, later events, including `dblclick`, report the SVG as their target. Use `pressedRef` to see what was actually pressed.
- **The fill is separate from the click target.** A mask per region draws the area that counts as inside: adding shapes minus holes. Transparent outlines on top take the clicks, and holes are drawn last so they stay clickable.
- **Drawing is clamped to the field, and moving isn't.** Shapes can be moved partly off the field on purpose.
- **Coordinates are rounded** to the grid, or to the nearest millimeter with snap off, so generated code doesn't carry meaningless digits.

## Opening, saving and exporting

These live in `actions.ts` and `dialogs/ExportDialog.tsx`, since they involve the main process as well as the state.

`doc !== savedDoc` means there are unsaved changes, so undoing back to the saved version counts as clean. While there are unsaved changes, the renderer sets `onbeforeunload`, and the main process's `will-prevent-unload` handler asks before closing.

Opening a project follows these rules, so work is only lost after a confirmation:

| Situation                                                  | Result                                                                                                            |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Another project is open, with unsaved changes              | Asks first, then loads the new project                                                                            |
| No project open, drawing, new project has saved regions    | Asks whether to replace the drawing. If not, the project closes again, because saving would overwrite its regions |
| No project open, drawing, nothing saved in the new project | The drawing carries over                                                                                          |
| Anything else                                              | Loads what's saved, or starts empty                                                                               |

Reloading the page closes the project in the main process, because a fresh empty editor must not be able to save over it.

At startup, the app reopens the last project. The main process remembers its path in `settings.json` in Electron's user data folder and reads it itself, so the renderer still never names a folder. This happens once per launch, so reloading still starts empty. A project that was moved or deleted is forgotten quietly. Tests pass `--user-data-dir`, so they can't touch a developer's real settings.

## Fields

The app starts on the newest field, without counting that as a change. `FieldCanvas` loads the image for `field.fieldId` and places it so its marked corners land on the field's corners, turning it 180° about the field's center if the definition says so. See `docs/fields.md` for why that matters.

The import dialog measures clicks as a fraction of the displayed image and converts them to the image's own pixels, so its size on screen doesn't matter. Its container has to shrink to fit the image for that to work.

## Not yet in the editor

Zooming and panning aren't planned for v1.
