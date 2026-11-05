# 0013: Protect team work in saved files

**Status:** accepted

## Decision

`.regionbool/regions.json` is never overwritten if it can't be understood, and export writes nothing in that case either. The hash used to notice hand edits to generated code lives in that file, and only the main process reads or changes it.

## Why

Teams commit this file, so merges and hand edits will sometimes break it, and a newer app may write a version this one doesn't understand. Silently replacing it would destroy work that may be hard to recreate. Keeping the hash out of the renderer means the warning always reflects what was actually written.

## Consequences

Someone has to fix or remove a broken file before the app can save. The app also doesn't watch the file while it's open, so saving after a `git pull` without reopening replaces the pulled version. If that causes trouble, the fix is to compare against the version read at open.
