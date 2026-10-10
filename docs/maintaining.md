# Maintaining

For maintainers: what this repository ships, what it only uses, and how a release is made.

## The artifact

The package is data: the files that an author wrote. It has no build step, no generated file and no code. `npm pack` sends these
files, and `tools/pack-check.mjs` fails on anything else.

| Ships | What it is |
|---|---|
| `modules/**/*.nbt` | The numbers, as plain Numbat modules. They work in UnitPad and in the Numbat command line. |
| `unitpad.json` | What UnitPad reads: the manifest `format`, the `prelude` (what every sheet starts with), and the menu `types`. |
| `README.md`, `LICENSE`, `package.json` | What npm shows and needs. |

`api.json`, `values.json` and `numbat-version.json` are in the repository and not in the package. They record the last release for the checks.

Why there is no build: a build is a second place for a number to be wrong. A reviewer reads the files that a reader gets. If a
derived file is ever needed, such as a catalog for a website, a release makes it from these files. It is never committed and never
edited by hand.

## What does not ship

| Where | What |
|---|---|
| `CONTRIBUTING.md`, `docs/` | How to write, review and release |
| `.github/` | The pull request template, the issue form, the workflows |
| `tools/` | The checks and the scheduled lists |
| `tools/numbat/` | The Numbat build that reads a module, with its patches and licences (`tools/numbat/README.md`) |

## Two contracts

- **With UnitPad: `unitpad.json`.** Its `format` only grows. A new field is optional. UnitPad refuses a format it does not know when
  it is built, never while it runs. Removing or renaming a module needs a major version.
- **With the Numbat command line: the module path.** `modules/` works as a Numbat module path. The package has no `prelude.nbt`,
  because Numbat takes that file as a replacement for its own prelude.

## The workflows

| File | Runs | What it does |
|---|---|---|
| `.github/workflows/check.yml` | Each pull request and each push to `main` | `npm ci`, installs `numbat`, then `npm run check` |
| `.github/workflows/release.yml` | A tag `vX.Y.Z` | The same check, then the tag, `api.json` and `values.json` must match the version, then `npm publish` with provenance |
| `.github/workflows/maintenance.yml` | Each Monday | Lists the modules that are due a check, and fails when a source no longer answers |
| `.github/dependabot.yml` | Each Monday | Opens pull requests for npm and Actions updates |

The release workflow needs a secret `NPM_TOKEN`: a granular npm token that may publish `@unitpad/modules`.

## Make a release

1. Choose the version by the table in `CONTRIBUTING.md`. `node tools/api.mjs` tells you the least step that the names need.
2. Run `node tools/api.mjs --update` and `node tools/values.mjs --update`. They write the names and the values of this release to
   `api.json` and `values.json`. Commit them with the version.
3. Run `npm run check`. It must pass.
4. Tag `vX.Y.Z`, equal to the version in `package.json`, and push the tag.
5. The release workflow publishes the tag with npm provenance. A published version then names the commit it came from. Nobody publishes
   from a laptop. npm takes a minute or two to show the new version, and a package's first publish shows a placeholder version,
   `0.0.0-stage`, until then.
6. UnitPad moves to the new version with its own pull request.

## Not built

- A check of the functions. `values.json` holds the values (`let`) only. A function's signature and its `@example` results are not compared.
- A check that the checksums in `numbat-version.json` match a second source. They come from the release on GitHub, when the version was chosen.
- Issues opened from the lists of stale modules and dead sources. The lists are in the summary of each run.
- A git hook that runs `npm run check` before a commit.
- Publishing without a stored token, through npm trusted publishing.
