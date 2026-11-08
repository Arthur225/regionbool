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

Pull requests are merged by a person after review. `main` is protected: changes reach it only through a pull request, after CI passes on Windows, macOS and Linux. If you're contributing for the first time, a maintainer has to approve CI before it runs.

## Tests

- **Unit tests** live in `tests/unit` and run with Vitest. Anything in `src/shared` should be covered here.
- **Java checks** in `tests/unit` compile generated code, and they skip if there's no JDK or WPILib jars. A skip means unverified, so see [docs/testing.md](docs/testing.md).
- **End-to-end tests** live in `tests/e2e` and drive the real Electron app with Playwright.
- **Packaged tests** live in `tests/packaged` and check the built app. Run them when changing packaging, resources or dependencies.

## Documentation

Docs are part of the change. If a pull request changes behavior, structure or a rule, it updates the matching pages in the same pull request. Comments should explain why code exists, not restate what it does. Everything exported from `src/shared`, and each IPC channel, gets a TSDoc comment that states its purpose and units.

## Packaging

```bash
npm run test:packaged
```

This builds the app into `release/` for your system and tests the packaged result. Packaging has its own risks, like files left out of the package, that the regular tests can't see. `npm run dist` also builds the installers. Settings are in `electron-builder.yml`.

## Releases

To release:

1. Update `version` in `package.json`, and merge it.
2. Tag `main` and push the tag, which starts `.github/workflows/release.yml`:

   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

3. The workflow tests and builds on each system, then creates a **draft** release.
4. Try the installers, then publish the draft by hand.

The same workflow also runs as a check on pull requests that change packaging, and it publishes nothing in that case. It doesn't run on every pull request, because it takes a while on three systems. `.github/workflows/ci.yml` runs on every pull request instead, with the checks and end-to-end tests.

Builds are ad-hoc signed on macOS and unsigned on Windows. Signing needs paid certificates, which would be added to `electron-builder.yml` and the workflow as secrets.
