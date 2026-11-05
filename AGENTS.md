# RegionBool: guide for AI agents and developers

RegionBool is an Electron desktop app for FRC programmers. You draw regions on a field map using rectangles, circles, triangles and polygons, and the app generates a Java class in a WPILib robot project with one boolean method per region, answering "is this position inside the region?".

**Current state:** build step 2 of 7. The core logic in `src/shared` (region model, point-in-region math, Java generation) is done and tested, but it isn't connected to any UI yet, so the app still opens a placeholder window. See [Build status](#build-status).

## Commands

| Command            | What it does                                        |
| ------------------ | --------------------------------------------------- |
| `npm install`      | Installs dependencies (Node 22.12 or newer)         |
| `npm run dev`      | Runs the app with hot reload                        |
| `npm run check`    | Runs formatting, lint, type and unit test checks    |
| `npm test`         | Runs unit tests only                                |
| `npm run test:e2e` | Builds the app and runs Playwright against Electron |
| `npm run format`   | Rewrites files with Prettier                        |

Run `npm run check` and `npm run test:e2e` before opening a pull request.

## Repository map

Every path in this table must exist. `tests/unit/docs.test.ts` fails if one doesn't, so update the table when you move something.

<!-- repo-map:start -->

| Path                          | Purpose                                                         |
| ----------------------------- | --------------------------------------------------------------- |
| `src/main/index.ts`           | Main process entry: window creation, security, IPC handlers     |
| `src/preload/index.ts`        | Bridge that exposes `window.regionbool` to the renderer         |
| `src/preload/api.d.ts`        | Type declaration for `window.regionbool`                        |
| `src/shared/ipc.ts`           | IPC channel names and types, the full renderer-to-main contract |
| `src/shared/model.ts`         | Region types and validation                                     |
| `src/shared/geometry.ts`      | Point-in-region math used by the preview                        |
| `src/shared/javaProfiles.ts`  | What generated code needs for each WPILib version               |
| `src/shared/codegen.ts`       | Generates the Java class                                        |
| `schemas/regions.schema.json` | JSON Schema for `.regionbool/regions.json`                      |
| `src/renderer/App.tsx`        | Root React component                                            |
| `src/renderer/main.tsx`       | Renderer entry point                                            |
| `tests/unit/`                 | Vitest tests                                                    |
| `tests/e2e/`                  | Playwright tests that launch the real Electron app              |
| `docs/architecture.md`        | Processes, security model and data flow                         |
| `docs/data-model.md`          | Regions, coordinates, the rules for "inside", file format       |
| `docs/codegen.md`             | Generated class layout, import profiles, how to add a profile   |
| `docs/testing.md`             | Test layers, what each proves, what skips mean                  |
| `docs/decisions/`             | Why the project is built the way it is                          |
| `CONTRIBUTING.md`             | Branch, pull request and test expectations                      |

<!-- repo-map:end -->

## Invariants

Breaking one of these is a bug even if the tests pass. Rules marked (lint) are enforced by `eslint.config.mjs`.

1. **`src/shared` has no Electron, Node, React or DOM imports** (lint). It has to run in every process and in plain unit tests.
2. **The renderer never touches the filesystem or Electron directly** (lint). It only calls `window.regionbool`.
3. **Each IPC channel is declared in `src/shared/ipc.ts`** and has one named method in the preload script. Never expose `ipcRenderer` itself.
4. **The window stays sandboxed:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. An end-to-end test checks this.
5. **All coordinates are WPILib field coordinates in meters:** blue-origin, +x toward red, +y to the left. Pixels exist only in the rendering layer.

6. **The app preview and generated Java must agree on every point.** A change to `geometry.ts` needs the same change in `codegen.ts`, and `tests/unit/java-crosscheck.test.ts` proves they match.
7. **Generated region checks don't allocate,** because robot code calls them every loop. WPILib's `getAlliance()` is the only exception.
8. **Text from project files never reaches generated code unvalidated.** See `docs/codegen.md`.
9. **Check WPILib APIs against the real jars or sources, not memory.** They differ between alphas.

This applies once the writer exists (build step 3):

10. **Writes stay inside the selected project,** and the app never overwrites a file without the RegionBool header.

## Build status

Each step is one branch and one pull request. The full reasoning is in `docs/decisions/`.

| Step | Scope                                                   | Status |
| ---- | ------------------------------------------------------- | ------ |
| 1    | Electron scaffold, security settings, tooling, docs     | Done   |
| 2    | Data model, geometry, codegen, import profiles          | Done   |
| 3    | Project detection, safe writer, field loading, IPC      | To do  |
| 4    | Canvas, drawing tools, region panel, undo, point tester | To do  |
| 5    | Export with diff, save and load, Field2d helper         | To do  |
| 6    | Bundled fields and custom field import                  | To do  |
| 7    | Packaging, release workflow, user README                | To do  |

Paths planned for later steps, not yet present: `src/main/{project,writer,fields,ipc}.ts`, `src/renderer/{store.ts,canvas/,panels/,dialogs/}`, `resources/fields/`, and `docs/fields.md`.

## Common changes

**Add an IPC call:** declare the channel and types in `src/shared/ipc.ts`, add the method to `RegionBoolApi`, implement it in `src/preload/index.ts`, register the handler in the main process, and update the expected key list in `tests/e2e/app.spec.ts`. That test exists so any growth in what the renderer can reach is a deliberate change. Validate arguments in the handler, because the main process shouldn't trust renderer input.

**Change generated Java:** edit `src/shared/codegen.ts`, and `geometry.ts` too if the math changes. Run `npm test`, then review the snapshot diff before accepting it with `npx vitest run -u`.

**Add or update a WPILib profile:** follow the steps in `docs/codegen.md`.

**Change the file format:** update `src/shared/model.ts`, `schemas/regions.schema.json` and `docs/data-model.md` together.

**Record a significant decision:** add a numbered file to `docs/decisions/` and list it in that folder's `README.md`.

## Before you finish

- Update any docs your change affects, including the map and build status above.
- Follow the checklist in `.github/pull_request_template.md`.
