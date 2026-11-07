# RegionBool: guide for AI agents and developers

RegionBool is an Electron desktop app for FRC programmers. You draw regions on a field map using rectangles, circles, triangles and polygons, and the app generates a Java class in a WPILib robot project with one boolean method per region, answering "is this position inside the region?".

**Current state:** all 7 build steps are done, and the repository is public under the MIT license. No installers have been released yet (see "Releases" in `CONTRIBUTING.md`).

## Commands

| Command                 | What it does                                        |
| ----------------------- | --------------------------------------------------- |
| `npm install`           | Installs dependencies (Node 22.12 or newer)         |
| `npm run dev`           | Runs the app with hot reload                        |
| `npm run check`         | Runs formatting, lint, type and unit test checks    |
| `npm test`              | Runs unit tests only                                |
| `npm run test:e2e`      | Builds the app and runs Playwright against Electron |
| `npm run test:packaged` | Builds the packaged app and tests it                |
| `npm run dist`          | Builds installers for this system into `release/`   |
| `npm run format`        | Rewrites files with Prettier                        |

Run `npm run check` and `npm run test:e2e` before opening a pull request, plus `npm run test:packaged` if you changed packaging, resources or dependencies.

## Repository map

Every path in this table must exist. `tests/unit/docs.test.ts` fails if one doesn't, so update the table when you move something.

<!-- repo-map:start -->

| Path                                         | Purpose                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------- |
| `src/main/index.ts`                          | Main process entry: window creation and security                          |
| `src/main/ipc.ts`                            | IPC handlers, and holds the current project                               |
| `src/main/project.ts`                        | Recognizes WPILib Java projects, detects the import profile               |
| `src/main/export.ts`                         | Validates region data, generates code, applies overwrite rules            |
| `src/main/regionsFile.ts`                    | Reads and saves `.regionbool/regions.json`, never over an unreadable file |
| `src/main/writer.ts`                         | Atomic writes that can't leave the project                                |
| `src/main/settings.ts`                       | Per-computer app settings, such as the last project                       |
| `src/main/fields.ts`                         | Loads field definitions and images                                        |
| `src/preload/index.ts`                       | Bridge that exposes `window.regionbool` to the renderer                   |
| `src/preload/api.d.ts`                       | Type declaration for `window.regionbool`                                  |
| `src/shared/ipc.ts`                          | IPC channel names and types, the full renderer-to-main contract           |
| `src/shared/model.ts`                        | Region types and validation                                               |
| `src/shared/geometry.ts`                     | The reference definition of "inside", checked against generated Java      |
| `src/shared/javaProfiles.ts`                 | What generated code needs for each WPILib version                         |
| `src/shared/fields.ts`                       | Field definition format and parser                                        |
| `src/shared/codegen.ts`                      | Generates the Java class                                                  |
| `schemas/regions.schema.json`                | JSON Schema for `.regionbool/regions.json`                                |
| `src/shared/lineDiff.ts`                     | Line diff for the export preview                                          |
| `src/shared/shapeOps.ts`                     | Pure shape edits: move, rotate, resize, flip, snap                        |
| `src/renderer/store.ts`                      | Editor state and undo                                                     |
| `src/renderer/canvas/FieldCanvas.tsx`        | The field map and all pointer handling                                    |
| `src/renderer/panels/`                       | Toolbar, region list and properties                                       |
| `src/renderer/actions.ts`                    | Opening and saving, which involve both processes                          |
| `src/renderer/dialogs/ExportDialog.tsx`      | Export preview, warnings and writing                                      |
| `src/renderer/dialogs/FieldImportDialog.tsx` | Importing an image and marking the field's corners                        |
| `src/renderer/App.tsx`                       | Root React component                                                      |
| `src/renderer/main.tsx`                      | Renderer entry point                                                      |
| `resources/fields/`                          | Bundled field definitions and images, with sources in `SOURCES.md`        |
| `tests/unit/`                                | Vitest tests                                                              |
| `tests/packaged/`                            | Tests that run against the packaged app                                   |
| `build/icon.svg`                             | App icon source, rendered to `build/icon.png` for packaging               |
| `electron-builder.yml`                       | Packaging settings                                                        |
| `.github/workflows/release.yml`              | Tests and builds on all systems, and creates draft releases               |
| `tests/e2e/`                                 | Playwright tests that launch the real Electron app                        |
| `docs/architecture.md`                       | Processes, security model and data flow                                   |
| `docs/data-model.md`                         | Regions, coordinates, the rules for "inside", file format                 |
| `docs/codegen.md`                            | Generated class layout, import profiles, how to add a profile             |
| `docs/fields.md`                             | Field file format, symmetry, image licenses                               |
| `docs/editor.md`                             | Canvas coordinates, state, undo, interaction pitfalls                     |
| `docs/testing.md`                            | Test layers, what each proves, what skips mean                            |
| `docs/decisions/`                            | Why the project is built the way it is                                    |
| `LICENSE`                                    | MIT, excluding `resources/fields`, with generated code left to its users  |
| `CONTRIBUTING.md`                            | Branch, pull request and test expectations                                |

<!-- repo-map:end -->

## Invariants

Breaking one of these is a bug even if the tests pass. Rules marked (lint) are enforced by `eslint.config.mjs`.

1. **`src/shared` has no Electron, Node, React or DOM imports** (lint). It has to run in every process and in plain unit tests.
2. **The renderer never touches the filesystem or Electron directly** (lint). It only calls `window.regionbool`.
3. **Each IPC channel is declared in `src/shared/ipc.ts`** and has one named method in the preload script. Never expose `ipcRenderer` itself.
4. **The window stays sandboxed:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. An end-to-end test checks this.
5. **All coordinates are WPILib field coordinates in meters:** blue-origin, +x toward red, +y to the left. Pixels exist only in the rendering layer.

6. **`geometry.ts` and generated Java must agree on every point.** A change to `geometry.ts` needs the same change in `codegen.ts`, and `tests/unit/java-crosscheck.test.ts` proves they match.
7. **Generated region checks don't allocate,** because robot code calls them every loop. WPILib's `getAlliance()` is the only exception.
8. **Text from project files never reaches generated code unvalidated.** See `docs/codegen.md`.
9. **Check WPILib APIs against the real jars or sources, not memory.** They differ between alphas.

10. **Writes stay inside the selected project,** and the app never overwrites a file without the RegionBool header.
11. **An unreadable `regions.json` is never overwritten,** and unsaved work is only discarded after asking.
12. **A bundled image's orientation must match field coordinates, with blue on the left.** Tests can't fully catch this, so check it against AprilTag positions by eye.
13. **The renderer never sends paths or file contents.** The main process picks files through dialogs and generates code itself.

## Build status

Each step is one branch and one pull request. The full reasoning is in `docs/decisions/`.

| Step | Scope                                               | Status |
| ---- | --------------------------------------------------- | ------ |
| 1    | Electron scaffold, security settings, tooling, docs | Done   |
| 2    | Data model, geometry, codegen, import profiles      | Done   |
| 3    | Project detection, safe writer, field loading, IPC  | Done   |
| 4    | Canvas, drawing tools, region panel, undo           | Done   |
| 5    | Export with diff, save and load, Field2d helper     | Done   |
| 6    | Bundled fields and custom field import              | Done   |
| 7    | Packaging, release workflow, user README            | Done   |

## Common changes

**Add an IPC call:** declare the channel and types in `src/shared/ipc.ts`, add the method to `RegionBoolApi`, implement it in `src/preload/index.ts`, register the handler in `src/main/ipc.ts`, and update the expected key list in `tests/e2e/app.spec.ts`. That test exists so any growth in what the renderer can reach is a deliberate change. Validate arguments in the handler, because the main process shouldn't trust renderer input, and keep logic in a module that doesn't import Electron so it can be unit tested. Update the table in `docs/architecture.md`.

**Change canvas behavior:** read `docs/editor.md` first. Put shape math in `src/shared/shapeOps.ts`, where it can be unit tested, and add an end-to-end case in `tests/e2e/canvas.spec.ts`.

**Add a run-time dependency of the main process:** put it in `dependencies`, not `devDependencies`, and run `npm run test:packaged`. Libraries the renderer uses are bundled, so they stay dev dependencies.

**Add a season's field:** follow `docs/fields.md`, including checking the image's orientation by eye.

**Change generated Java:** remember teams may run formatters over it, so `normalizeJava` must still see only real edits. Edit `src/shared/codegen.ts`, and `geometry.ts` too if the math changes. Run `npm test`, then review the snapshot diff before accepting it with `npx vitest run -u`.

**Add or update a WPILib profile:** follow the steps in `docs/codegen.md`.

**Change saving or opening:** read the rules in `docs/editor.md`. The guiding rule is that nothing may destroy a user's work without asking, and every refusal has a test in `tests/e2e/export.spec.ts`.

**Change the file format:** update `src/shared/model.ts`, `schemas/regions.schema.json` and `docs/data-model.md` together.

**Record a significant decision:** add a numbered file to `docs/decisions/` and list it in that folder's `README.md`.

## Before you finish

- Update any docs your change affects, including the map and build status above.
- Follow the checklist in `.github/pull_request_template.md`.
