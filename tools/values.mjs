#!/usr/bin/env node
/**
 * What each value and each function in a module is and says, as the official `numbat` program reads it, held against the last
 * release. `api.mjs` sees names only. This tool runs every module in Numbat, so it also sees that a module still loads, that a value
 * kept its dimension, that a function kept its signature, and which values, examples and descriptions moved. It needs the program
 * (`NUMBAT_BIN`, default `numbat`) at the version `numbat-version.json` names.
 *
 *   node tools/values.mjs              check every module against `values.json` and the version
 *   node tools/values.mjs --update     write `values.json` for the current modules (a maintainer, before a release tag)
 *   node tools/values.mjs --release    fail unless `values.json` is exactly the current modules (the release workflow)
 *
 * A module that does not load fails. A value or an example that changed its dimension, or a function whose signature changed, needs a
 * major step (while the major is 0: minor). A value or an example result that moved, or a description that changed, needs a patch step.
 * Each change is listed with its old and new text, so a reviewer sees what moved. Without the program the tool says so and stops
 * with a failure when `REQUIRE_NUMBAT` is set (CI), and skips otherwise.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bumpedEnough, namesOf, preludeReach, readModuleFiles } from './api.mjs';
import { examplesOfDefinition, readModule } from './lib/definitions.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
/** The program: `NUMBAT_BIN`, else the one `tools/install-numbat.mjs` put in `.numbat/`, else `numbat` on the path. */
const INSTALLED = join(root, '.numbat', 'numbat');
export const BIN = process.env.NUMBAT_BIN ?? (existsSync(INSTALLED) ? INSTALLED : 'numbat');

/** The `@example("…")` expressions of each function of a module text, as Numbat's parser reads them: `Map(function → [expression])`. */
export function examplesOf(text) {
  return new Map(
    readModule(text)
      .definitions.filter((d) => d.kind === 'fn')
      .map((d) => [d.name, examplesOfDefinition(d).map((e) => e.code)]),
  );
}

/** The results the program printed, in order: `[{ value, type }]`. A plain number has no dimension to show, so it is a scalar. */
export function parseResults(output) {
  const results = [];
  for (const line of output.split('\n')) {
    const result = /^\s*=\s+(.*?)(?:\s{2,}\[(.*)\])?\s*$/.exec(line);
    if (result) results.push({ value: result[1], type: result[2] ?? 'Scalar' });
  }
  return results;
}

/** The `info` of each function, in order: `Map(name → { signature, description })`. */
export function parseInfo(output) {
  const found = new Map();
  let current = null;
  for (const line of output.split('\n')) {
    const text = line.trim();
    const name = /^Function:\s+(\w+)/.exec(text);
    if (name) found.set((current = name[1]), { signature: '', description: '' });
    else if (current && text.startsWith('Signature:'))
      found.get(current).signature = text.replace(/^Signature:\s*/, '');
    else if (current && text.startsWith('Description:'))
      found.get(current).description = text.replace(/^Description:\s*/, '');
  }
  return found;
}

/** The first error of the program's output, with its message and the line it points at. */
export function firstError(output) {
  const lines = output.split('\n');
  const at = lines.findIndex((l) => /^error/.test(l.trim()));
  if (at < 0) return 'a line has no result';
  const caret = lines.slice(at).find((l) => /\^+\s+\S/.test(l));
  const where = lines.slice(at).find((l) => /^\s*\d+\s*│/.test(l));
  return `${lines[at].trim()}${caret ? `: ${caret.replace(/^.*?\^+\s+/, '')}` : ''}${where ? ` at \`${where.replace(/^\s*\d+\s*│\s*/, '').trim()}\`` : ''}`;
}

/**
 * A configuration for the program that does not fetch exchange rates: the values must not depend on the network or on the day.
 * (A currency stays the unit it is written in. Only a conversion between currencies needs the rates, and no value here converts.)
 */
export function offlineConfigDir() {
  const dir = mkdtempSync(join(tmpdir(), 'unitpad-numbat-'));
  mkdirSync(join(dir, 'numbat'));
  writeFileSync(join(dir, 'numbat', 'config.toml'), '[exchange-rates]\nfetching-policy = "never"\n');
  return dir;
}

export function run(config, modulesDir, lines, pretty) {
  const run = spawnSync(BIN, ['--color', 'never', '--pretty-print', pretty], {
    input: `${lines.join('\n')}\n`,
    encoding: 'utf8',
    env: { ...process.env, NUMBAT_MODULES_PATH: modulesDir, XDG_CONFIG_HOME: config, HOME: config },
  });
  return run.error ? { error: run.error.message } : { output: `${run.stdout}\n${run.stderr}` };
}

/**
 * Run a module in Numbat, one line to a line of its standard input, so that the program prints each result with its dimension:
 * `{ ok, module: { values, functions }, error }`. The values are the module's `let`s, the functions' examples are the `@example`s
 * above them, and the signature and description of a function are what `info` says.
 */
export function evaluate(config, modulesDir, id, text) {
  const { values: names, functions } = namesOf(text);
  const examples = examplesOf(text);
  const codes = functions.flatMap((f) => (examples.get(f) ?? []).map((code) => ({ fn: f, code })));
  const head = ['use units::systems', `use ${id}`];

  const results = run(config, modulesDir, [...head, ...names, ...codes.map((c) => c.code)], 'always');
  if (results.error) return { ok: false, error: results.error };
  const parsed = parseResults(results.output);
  if (parsed.length !== names.length + codes.length) return { ok: false, error: firstError(results.output) };

  const info = run(config, modulesDir, [...head, ...functions.map((f) => `info ${f}`)], 'never');
  if (info.error) return { ok: false, error: info.error };
  const docs = parseInfo(info.output);
  const lost = functions.filter((f) => !docs.has(f));
  if (lost.length > 0) return { ok: false, error: `no documentation for: ${lost.slice(0, 3).join(', ')}` };

  const values = Object.fromEntries(names.map((n, i) => [n, parsed[i]]));
  const out = Object.fromEntries(functions.map((f) => [f, { ...docs.get(f), examples: [] }]));
  codes.forEach((c, i) => out[c.fn].examples.push({ code: c.code, ...parsed[names.length + i] }));
  return { ok: true, module: { values, functions: out } };
}

/**
 * What changed between two snapshots: `dimensions` (a value, an example or a function whose dimension or signature changed), `moved`
 * (a value or an example result that is another number) and `docs` (a description that changed).
 */
export function diffValues(before, after) {
  const dimensions = [];
  const moved = [];
  const docs = [];
  for (const [id, old] of Object.entries(before)) {
    const now = after[id];
    if (!now) continue; // a removed module is `api.mjs`'s to judge
    for (const [name, was] of Object.entries(old.values)) {
      const is = now.values[name];
      if (!is) continue; // a removed name too
      if (is.type !== was.type) dimensions.push(`${id}.${name}: ${was.type} -> ${is.type}`);
      else if (is.value !== was.value) moved.push(`${id}.${name}: ${was.value} -> ${is.value}`);
    }
    for (const [name, was] of Object.entries(old.functions)) {
      const is = now.functions[name];
      if (!is) continue;
      if (is.signature !== was.signature) dimensions.push(`${id}.${name}: ${was.signature} -> ${is.signature}`);
      if (is.description !== was.description) docs.push(`${id}.${name}: the description changed`);
      for (const [i, example] of was.examples.entries()) {
        const next = is.examples.find((e) => e.code === example.code) ?? is.examples[i];
        if (!next) continue;
        if (next.type !== example.type)
          dimensions.push(`${id}.${name} example ${example.code}: ${example.type} -> ${next.type}`);
        else if (next.value !== example.value)
          moved.push(`${id}.${name} example ${example.code}: ${example.value} -> ${next.value}`);
      }
    }
  }
  return { dimensions, moved, docs };
}

/** The step the version must take for these changes, as in `api.mjs`: a dimension or signature change is breaking, the rest a patch. */
export function stepFor(diff, version) {
  const zero = version.startsWith('0.');
  if (diff.dimensions.length > 0) return zero ? 'minor' : 'major';
  return diff.moved.length + diff.docs.length > 0 ? 'patch' : null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const modulesDir = join(root, 'modules');
  const manifest = JSON.parse(readFileSync(join(root, 'unitpad.json'), 'utf8'));
  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  const pinned = JSON.parse(readFileSync(join(root, 'numbat-version.json'), 'utf8')).version;

  const probe = spawnSync(BIN, ['--version'], { encoding: 'utf8' });
  if (probe.error || probe.status !== 0) {
    console.log(
      `${process.env.REQUIRE_NUMBAT ? 'FAIL' : 'skip'} the numbat program was not found (run node tools/install-numbat.mjs, or set NUMBAT_BIN to version ${pinned})`,
    );
    process.exit(process.env.REQUIRE_NUMBAT ? 1 : 0);
  }
  const have = /numbat (\S+)/.exec(probe.stdout)?.[1];
  if (have !== pinned) {
    console.log(
      `FAIL numbat ${have} found, but ${pinned} is the version that the values are held to (numbat-version.json)`,
    );
    process.exit(1);
  }

  const config = offlineConfigDir();
  process.on('exit', () => rmSync(config, { recursive: true, force: true }));
  const files = readModuleFiles(modulesDir);
  const reach = preludeReach(files, manifest.prelude);
  const current = {};
  const failures = [];
  for (const id of Object.keys(files).sort()) {
    if (reach.has(id)) continue;
    const names = namesOf(files[id]);
    if (names.values.length + names.functions.length === 0) continue;
    const result = evaluate(config, modulesDir, id, files[id]);
    if (!result.ok) failures.push(`${id}: ${result.error}`);
    else current[id] = result.module;
  }
  if (failures.length > 0) {
    for (const f of failures) console.log(`FAIL ${f}`);
    process.exit(1);
  }

  const snapshotPath = join(root, 'values.json');
  if (process.argv.includes('--update')) {
    writeFileSync(snapshotPath, `${JSON.stringify({ version, numbat: pinned, modules: current }, null, 2)}\n`);
    console.log(
      `wrote values.json for ${version}: ${Object.values(current).reduce((n, m) => n + Object.keys(m.values).length + Object.keys(m.functions).length, 0)} values and functions`,
    );
    process.exit(0);
  }

  const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  const diff = diffValues(snapshot.modules, current);
  if (process.argv.includes('--release')) {
    const same =
      JSON.stringify(snapshot.modules) === JSON.stringify(current) &&
      snapshot.version === version &&
      snapshot.numbat === pinned;
    console.log(
      same
        ? `ok   values.json is the release ${version}`
        : `FAIL values.json is not the values of ${version}: run \`node tools/values.mjs --update\``,
    );
    process.exit(same ? 0 : 1);
  }
  const step = stepFor(diff, snapshot.version);
  if (step && !bumpedEnough(snapshot.version, version, step)) {
    console.log(
      `FAIL values changed since ${snapshot.version}, so the version must take a ${step} step (it is ${version})`,
    );
    for (const [label, list] of [
      ['dimension changed', diff.dimensions],
      ['value moved', diff.moved],
      ['documentation changed', diff.docs],
    ])
      for (const line of list) console.log(`  ${label}: ${line}`);
    process.exit(1);
  }
  console.log(
    `ok   ${Object.keys(current).length} modules load: ${diff.dimensions.length} dimensions changed, ${diff.moved.length} values moved, ${diff.docs.length} descriptions changed since ${snapshot.version}`,
  );
  for (const line of diff.moved) console.log(`  value moved: ${line}`);
  for (const line of diff.docs) console.log(`  documentation changed: ${line}`);
}
