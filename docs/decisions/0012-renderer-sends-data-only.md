# 0012: Keep paths and code out of the renderer

**Status:** accepted

## Decision

The renderer never sends a file path or file contents over IPC. The main process picks the project through a native dialog and remembers it. For export, the renderer sends region data, and the main process validates it and generates the code itself.

## Why

The renderer displays data from robot projects, so it's the part most exposed to malicious input. If it could send paths or code, a bug there could write anything anywhere. This way, the worst case is generated Java in the project the user chose.

## Consequences

The main process has to hold the current project, so only one can be open per app instance. Features like a recent-projects list need care, because reopening one without a dialog can't simply accept a path from the renderer.
