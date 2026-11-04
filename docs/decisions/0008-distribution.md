# 0008: Plan for public multi-platform installers

**Status:** accepted

## Decision

The app will have Windows, macOS and Linux installers built by electron-builder through GitHub Actions, unsigned at first.

## Why

FRC programmers use all three systems, and many teams use Windows.

## Consequences

Users will see an OS warning until builds are signed. The repository stays private until image licenses are cleared and the owner chooses to make it public, and no open-source license has been chosen yet.
