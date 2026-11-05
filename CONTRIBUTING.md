# Contributing to RegionBool

## Setup

You need Node 22.12 or newer. To check generated code against a real robot project, you also need a WPILib install.

```bash
npm install
npm run dev
```

Read [AGENTS.md](AGENTS.md) for the repository map and the rules the code has to follow, and [docs/architecture.md](docs/architecture.md) for how the parts fit together.

## Workflow

1. Branch from an up-to-date `main`. Build steps use `step/<number>-<topic>`, and other work uses `fix/<topic>` or `feat/<topic>`.
2. Make focused commits. Each commit message should say what changed and, where it isn't obvious, why.
3. Run `npm run check` and `npm run test:e2e`.
4. Open a pull request using the template, and say how you verified the change.

Pull requests are merged by a person after review.

## Tests

- **Unit tests** live in `tests/unit` and run with Vitest. Anything in `src/shared` should be covered here.
- **Java checks** in `tests/unit` compile generated code, and they skip if there's no JDK or WPILib jars. A skip means unverified, so see [docs/testing.md](docs/testing.md).
- **End-to-end tests** live in `tests/e2e` and drive the real Electron app with Playwright.

## Documentation

Docs are part of the change. If a pull request changes behavior, structure or a rule, it updates the matching pages in the same pull request. Comments should explain why code exists, not restate what it does. Everything exported from `src/shared`, and each IPC channel, gets a TSDoc comment that states its purpose and units.

## Releases

The release process will be documented here when packaging is added in build step 7.
