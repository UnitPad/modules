# Contributing

This repository holds the numbers that UnitPad sheets import with `use`: latencies, throughputs, sizes, prices and limits for system
design, each with its source. You can fix an outdated number, add a number, add a module, or replace a dead source. This page says
how. [`docs/style.md`](docs/style.md) says how a module file is written, and [`docs/writing.md`](docs/writing.md) says how the documents here are
written.

## What is in this repository

| Here | Not here |
|---|---|
| `modules/`: one `.nbt` file for each module. `a/b.nbt` is `use a::b`. | The UnitPad app: the editor, the Modules menu, the example sheets |
| `modules/units/systems/`: the shared count units | Problems with how the app shows or calculates a number. Report them at [`UnitPad/unitpad-feedback`](https://github.com/UnitPad/unitpad-feedback). |
| `unitpad.json`: what every sheet starts with, and the order and headings of the Modules menu | |

A wrong, outdated or missing value, function or unit belongs here. Open an issue with the form "Something is wrong or out of date", or send a pull
request.

## Licence of a contribution

A change that you send is under the MIT licence of this repository. You confirm that you wrote it, or that you have the right to send
it. The numbers are facts. The descriptions are your words, so paraphrase the source and do not paste it.

## Change a module

1. Edit the file. Follow [`docs/style.md`](docs/style.md). Every value has a `@description`. A value with a source has an `@url`. A number
   with no primary source says so in its description (`estimate`, `rule of thumb`).
2. Run it in the Numbat command line. The modules are plain Numbat, so the official `numbat` program can load them.

   ```bash
   # try.nbt has `use latency::hardware` on line 1 and `latency_main_memory` on line 2.
   NUMBAT_MODULES_PATH=modules numbat try.nbt
   ```

   Not run yet. To have the shared units too, put `use units::systems` in your `init.nbt`.
3. Open a pull request. The template asks for the source page of each value you add or change, and for the figure as that page gives
   it. A reviewer can then check it without searching. Paraphrase the description. Do not paste the vendor's text.
4. Raise the module's `# checked:` month only for the values you compared with their sources.

## What you can run

The packages are installed with [pnpm](https://pnpm.io), at the version that `packageManager` in `package.json` names. With Node 22 or newer, `corepack enable pnpm` makes that version the one you get. The settings of pnpm are in `pnpm-workspace.yaml`: no dependency version younger than 14 days is installed.

| Command | What it does |
|---|---|
| `node tools/pack-check.mjs` | Checks that a release would hold only the package's files |
| `pnpm install --frozen-lockfile`, then `pnpm run check` | Runs everything below, the formatter, the linters and the tests |
| `pnpm test` | Runs the tests of the checks below |
| `node tools/check-docs.mjs` | Checks the documents here against [`docs/writing.md`](docs/writing.md) |
| `node tools/install-numbat.mjs` | Installs the official `numbat` program, at the pinned version and checksum, into `.numbat/` |
| `node tools/style.mjs` | Holds every module to the rules of `docs/style.md` |
| `node tools/values.mjs` | Runs every module in `numbat` and compares each value with the last release |
| `node tools/api.mjs` | Checks that the version has moved as far as the names require |
| `node tools/stale.mjs` | Lists the modules that are older than a year or `unverified` |
| `node tools/links.mjs` | Lists the sources that no longer answer |

Each needs only Node, and pnpm for the first two. `pnpm run check` also holds every module to the rules of [`docs/style.md`](docs/style.md). A reviewer reads for the numbers and their
sources.

## The commit hook

`pnpm install` points git at `.githooks/`. Its `pre-commit` runs the quick checks on what you staged: formatting, ESLint, markdownlint,
the documents check, the names and version check, and the package contents. When a module is staged, it also runs the style check,
which takes about 20 seconds. The tests and the values check run in CI. Skip the hook once with `git commit --no-verify`.

## Keeping numbers true

Numbers go out of date. Each module says when it was last checked (`# checked: YYYY-MM`, or `unverified`), and UnitPad shows that on
the module's card. A schedule runs `tools/stale.mjs` and `tools/links.mjs` and lists what is due. Checking a module that is due, and
replacing a dead source, are good first contributions.

## Version numbers

The package version says whether a sheet that ran before still runs. It does not say whether the numbers moved.

| Bump | When |
|---|---|
| Major | A name goes or is renamed (a module, unit, function or constant), a value changes its dimension, or a new unit takes a name that a sheet may already use for a variable |
| Minor | A new module, value or function |
| Patch | A corrected value, source or description |

When a name goes, write the old name in the pull request. UnitPad then tells its readers what to change.

A check holds the version to the names. `api.json` lists the names of the last release. A pull request that removes a name or a module
must raise the version in `package.json` by a major step. One that adds a name or a module must raise it by a minor step. While the
major version is 0, each step is one place lower: a removal raises the minor number, and an addition raises the patch number. A new unit in
the prelude takes a name in every sheet, so it needs the same step as a removal. You raise the version in the pull request. A maintainer
updates `api.json` when they release.

A second check runs every module in the official `numbat` program and compares each value with `values.json`, the values of the last
release. A module that no longer loads fails. A value that changes its dimension needs the same step as a removed name. A value that
moves needs a patch step, and the check lists each old and new value, so a reviewer sees what moved. The check needs the program:
`node tools/install-numbat.mjs` installs the pinned version into `.numbat/`.

## How a change reaches readers

A release of this package reaches readers only inside a release of UnitPad. UnitPad pins an exact version and moves it in a commit of
its own, and it checks its example sheets against the new version first. UnitPad never fetches modules while it runs. A
reader's results change only when they update UnitPad. You change this repository only. You never need to change both in one go.
