# 0010: Keep the repo self-explanatory for agents and developers

**Status:** accepted

## Decision

`AGENTS.md` is the entry point, with commands, a map and invariants. `CLAUDE.md` points to it. `docs/` holds architecture and decisions, and pull requests update whatever docs they affect.

## Why

Agents and new contributors start with no context, so anything needed to work safely has to be in the repo. Docs drift unless something checks them, so tests and lint rules enforce what they can.

## Consequences

A unit test checks that the repository map's paths exist, and lint enforces the process boundaries.
