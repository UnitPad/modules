#!/usr/bin/env node
/**
 * The names a sheet can use from this package, and whether the version says so when they change. A sheet that ran before still runs
 * only if every name it used is still there, so the version has to say when one goes (`docs/maintaining.md`).
 *
 * `api.json` holds the names of the last release: for each module, its values (`let`), functions (`fn`), units and dimensions, with
 * the aliases of each unit. This tool reads the modules, compares them with `api.json`, and fails when `package.json` has not moved
 * the version far enough:
 *
 *   a name or a module goes ......................... major (while the major is 0: minor)
 *   a unit or dimension is added to the prelude ..... major (a sheet may use the name already; while 0: minor)
 *   a name or a module is added ..................... minor (while the major is 0: patch)
 *
 * What it does not see: a value that changes, and a name that changes dimension. Both need Numbat to run the module.
 *
 *   node tools/api.mjs              check the modules against `api.json` and the version
 *   node tools/api.mjs --update     write `api.json` for the current modules and version (a maintainer, before a release tag)
 *   node tools/api.mjs --release    fail unless `api.json` is exactly the current modules and version (the release workflow)
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readModule, unitNames } from './lib/definitions.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

/** The `.nbt` files of a folder by module id (`latency::llm`): their text. */
export function readModuleFiles(dir) {
  const files = {};
  (function walk(d) {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.nbt'))
        files[
          relative(dir, full)
            .replace(/\.nbt$/, '')
            .split('\\')
            .join('/')
            .replaceAll('/', '::')
        ] = readFileSync(full, 'utf8');
    }
  })(dir);
  return files;
}

/** The names a module text defines, as Numbat's parser reads them: `{ values, functions, units, dimensions }`, each sorted. A unit's aliases are units too. */
export function namesOf(text) {
  const out = { values: [], functions: [], units: [], dimensions: [] };
  for (const d of readModule(text).definitions) {
    if (d.kind === 'let') out.values.push(d.name);
    else if (d.kind === 'fn') out.functions.push(d.name);
    else if (d.kind === 'unit') out.units.push(...unitNames(d));
    else if (d.kind === 'dimension') out.dimensions.push(d.name);
  }
  for (const k of Object.keys(out)) out[k] = [...new Set(out[k])].sort();
  return out;
}

/** The modules the manifest's `prelude` reaches: a module made only of `use` lines stands for those it lists. */
export function preludeReach(files, roots) {
  const reached = new Set();
  const visit = (id) => {
    if (reached.has(id) || files[id] === undefined) return;
    reached.add(id);
    const uses = files[id]
      .split('\n')
      .map((l) => l.replace(/#.*$/, '').trim())
      .filter(Boolean);
    if (uses.every((l) => /^use\s+[\w:]+$/.test(l))) for (const l of uses) visit(l.slice(4).trim());
  };
  roots.forEach(visit);
  return reached;
}

/** The names of every module, with which of them the prelude puts in every sheet. */
export function apiOf(files, prelude) {
  const reach = preludeReach(files, prelude);
  const modules = {};
  for (const id of Object.keys(files).sort()) modules[id] = { prelude: reach.has(id), ...namesOf(files[id]) };
  return modules;
}

const KINDS = ['values', 'functions', 'units', 'dimensions'];

/** What changed between two APIs: modules and names removed or added, and units added to the prelude. */
export function diffApi(before, after) {
  const removed = [];
  const added = [];
  const reserved = [];
  for (const id of Object.keys(before)) {
    if (!after[id]) removed.push(`module ${id}`);
    else
      for (const k of KINDS)
        for (const n of before[id][k]) if (!after[id][k].includes(n)) removed.push(`${k.slice(0, -1)} ${id}.${n}`);
  }
  for (const id of Object.keys(after)) {
    const old = before[id];
    if (!old) added.push(`module ${id}`);
    for (const k of KINDS)
      for (const n of after[id][k]) {
        if (old && old[k].includes(n)) continue;
        added.push(`${k.slice(0, -1)} ${id}.${n}`);
        if (after[id].prelude && (k === 'units' || k === 'dimensions')) reserved.push(`${k.slice(0, -1)} ${id}.${n}`);
      }
  }
  return { removed, added, reserved };
}

/** The step the version must take: `major`, `minor`, `patch` or none. While the major is 0, each step is one place lower. */
export function requiredStep(diff, version) {
  const breaking = diff.removed.length > 0 || diff.reserved.length > 0;
  const level = breaking ? 'major' : diff.added.length > 0 ? 'minor' : null;
  if (level === null) return null;
  return version.startsWith('0.') ? { major: 'minor', minor: 'patch' }[level] : level;
}

const parse = (v) => v.split('.').map(Number);

/** Whether `next` is at least one `step` above `last`: the first part that must move, moved, and none before it went the wrong way. */
export function bumpedEnough(last, next, step) {
  const [a, b] = [parse(last), parse(next)];
  const index = { major: 0, minor: 1, patch: 2 }[step];
  for (let i = 0; i < index; i++) if (b[i] !== a[i]) return b[i] > a[i];
  return b[index] > a[index];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const manifest = JSON.parse(readFileSync(join(root, 'unitpad.json'), 'utf8'));
  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  const current = apiOf(readModuleFiles(join(root, 'modules')), manifest.prelude);
  const snapshotPath = join(root, 'api.json');

  if (process.argv.includes('--update')) {
    writeFileSync(snapshotPath, `${JSON.stringify({ version, modules: current }, null, 2)}\n`);
    console.log(`wrote api.json for ${version}: ${Object.keys(current).length} modules`);
    process.exit(0);
  }

  const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  const diff = diffApi(snapshot.modules, current);
  if (process.argv.includes('--release')) {
    const same = diff.removed.length === 0 && diff.added.length === 0 && snapshot.version === version;
    console.log(
      same
        ? `ok   api.json is the release ${version}`
        : `FAIL api.json is ${snapshot.version}, not ${version} with these modules: run \`node tools/api.mjs --update\``,
    );
    process.exit(same ? 0 : 1);
  }

  const step = requiredStep(diff, snapshot.version);
  const problems = [];
  if (step && !bumpedEnough(snapshot.version, version, step))
    problems.push(
      `the names changed since ${snapshot.version}, so the version must take a ${step} step (it is ${version})`,
    );
  if (!step && version !== snapshot.version && !bumpedEnough(snapshot.version, version, 'patch'))
    problems.push(`the version ${version} is lower than the last release, ${snapshot.version}`);
  if (problems.length > 0) {
    for (const p of problems) console.log(`FAIL ${p}`);
    for (const [label, list] of [
      ['removed', diff.removed],
      ['added', diff.added],
      ['new names in every sheet', diff.reserved],
    ])
      if (list.length > 0) console.log(`  ${label}: ${list.join(', ')}`);
    process.exit(1);
  }
  console.log(
    `ok   ${version}: ${diff.added.length} names added and ${diff.removed.length} removed since ${snapshot.version}`,
  );
}
