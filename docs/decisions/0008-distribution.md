# 0008: Plan for public multi-platform installers

**Status:** accepted

## Decision

The app will have Windows, macOS and Linux installers built by electron-builder through GitHub Actions, unsigned at first.

## Why

FRC programmers use all three systems, and many teams use Windows.

## Consequences

Users will see an OS warning until builds are signed. The repository has been public since 2026-11-04. No open-source license has been chosen yet, so installers haven't been released. macOS builds are ad-hoc signed, because Apple Silicon won't run anything unsigned, which doesn't satisfy Gatekeeper. The README explains the workaround.
