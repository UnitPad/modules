#!/usr/bin/env node
/**
 * The rules of `docs/style.md`, held by a tool, so that review is about the numbers. A module is read by Numbat's own parser
 * (`tools/numbat/`, through `tools/lib/definitions.mjs`), and what needs a program to run it (an example, the unit of a value) runs in
 * the official `numbat` program, which is skipped with a message when it is not installed (`REQUIRE_NUMBAT=1`, as in CI, makes that a
 * failure).
 *
 *   node tools/style.mjs
 *
 * The rules:
 *   files      a module file is kebab-case, and a module defines a value or a function; the manifest has a known format, a prelude,
 *              unique menu types, and a menu entry for the type of every module
 *   header     the `# Import with:` line is the one the guide gives; `# title:` and `# description:` are there; `# checked:` is a
 *              month or `unverified`; `# highlight:` stands above a value
 *   text       a title and a description have no em dash, no `...`, no contraction, no `!`, no banned word, no `Numbat`, and no
 *              sentence of more than 20 words
 *   names      each value and function starts with the module path and has `@description`
 *   functions  each public function has an `@example`, and a type on every parameter and on its result
 *   units      a count unit has its own dimension and no metric prefixes (except FLOP); a unit lives only in a module that the
 *              prelude reaches; a unit name is defined once
 *   rates      no `_qps`, `_rps` or `_tps`; a count rate carries the word for what it counts (needs the program)
 *   examples   each `@example` and each `# usage:` line runs after `use <module>` (needs the program)
 *   currency   `USD` works in every session (needs the program)
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preludeReach, readModuleFiles } from './api.mjs';
import { decoratorArg, examplesOfDefinition, highlightsOf, readModule, unitNames } from './lib/definitions.mjs';
import { BIN, firstError, offlineConfigDir, parseResults, run } from './values.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Names, `@description`, and the public functions. */
export function definitionIssues(definitions, id) {
  const issues = [];
  const prefix = `${id.replaceAll('::', '_')}_`;
  for (const d of definitions) {
    if (d.kind !== 'let' && d.kind !== 'fn') continue;
    const at = `line ${d.line + 1}: `;
    if (!d.name.startsWith(prefix)) issues.push(`${at}${d.name} is not prefixed with "${prefix}"`);
    if (!decoratorArg(d, 'description')) issues.push(`${at}${d.name} has no @description`);
    if (d.kind !== 'fn' || d.name.startsWith('_')) continue;
    if (examplesOfDefinition(d).length === 0) issues.push(`${at}public function ${d.name} has no @example`);
    if (!d.returns || d.params.some((p) => !p.annotated))
      issues.push(`${at}public function ${d.name} must annotate every parameter and its return type`);
  }
  return issues;
}

/** The only count unit whose prefixed forms are how people write it (`TFLOP`); every other count takes scale words. */
const PREFIXED_COUNTS = new Set(['FLOP']);

/** How a unit is declared: a count has its own dimension and no metric prefixes. */
export function unitIssues(definitions) {
  const issues = [];
  for (const d of definitions) {
    if (d.kind !== 'unit' || !d.base) continue;
    const at = `line ${d.line + 1}: `;
    if (!d.typed)
      issues.push(`${at}unit ${d.name} needs its own dimension: \`dimension X\`, then \`unit ${d.name}: X\``);
    if (d.decorators.some((x) => x.name === 'metric_prefixes') && !PREFIXED_COUNTS.has(d.name))
      issues.push(
        `${at}count unit ${d.name} must not take @metric_prefixes; write scale in words (\`5 million ${d.name}\`)`,
      );
  }
  return issues;
}

/** The `# Import with:` line, worded the same in every module. */
export function importHeaderIssues(text, definitions, id) {
  const fns = definitions.some((d) => d.kind === 'fn');
  const expected = `# Import with:  use ${id}    then use the ${id.replaceAll('::', '_')}_* values${fns ? ' and functions' : ''}`;
  return text.split('\n').includes(expected) ? [] : [`header must have the line: ${expected}`];
}

/** `# checked: 2026-10` (a month, not in the future) or `# checked: unverified`. */
export function checkedIssues(text) {
  const found = /^#\s*checked:\s*(\S+)\s*$/im.exec(text)?.[1];
  if (found === undefined) return ['the header has no `# checked: YYYY-MM` (or `# checked: unverified`)'];
  if (found === 'unverified') return [];
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(found))
    return [`\`# checked: ${found}\` is not a month (YYYY-MM) or \`unverified\``];
  return found > new Date().toISOString().slice(0, 7) ? [`\`# checked: ${found}\` is in the future`] : [];
}

/** `# highlight: Label` stands above a value: it has a label, and the definition after it is a `let`. */
export function highlightIssues(text, definitions) {
  const issues = [];
  for (const h of highlightsOf(text, definitions)) {
    if (!h.label) issues.push(`line ${h.line + 1}: a highlight needs a label`);
    else if (h.next?.kind !== 'let')
      issues.push(`line ${h.line + 1}: the highlight "${h.label}" is not above a value (let)`);
  }
  return issues;
}

/** Words that a title or a description does not use, and what it says instead (whole words). */
const BANNED_WORDS = [
  ['library', 'module'],
  ['libraries', 'modules'],
  ['package', 'module'],
  ['click', 'select'],
  ['tap', 'select'],
  ['press', 'select'],
  ['answer', 'result'],
  ['answers', 'results'],
  ['notebook', 'sheet'],
  ['worksheet', 'sheet'],
  ['hotkey', 'shortcut'],
  ['keybinding', 'shortcut'],
  ['template', 'example'],
  ['simply', '(leave it out)'],
  ['just', '(leave it out)'],
  ['easily', '(leave it out)'],
  ['please', '(leave it out)'],
  ['oops', '(say what is wrong)'],
  ['sorry', '(say what is wrong)'],
  ['successfully', '(leave it out)'],
];
const CONTRACTION = /n[’']t\b|[’'](re|ve|ll|d|m)\b|\b(it|that|there|what|here|let|who|he|she)[’']s\b/i;
export const MAX_SENTENCE_WORDS = 20;

/** What is wrong with a module's title or description, as text that a reader sees in the menu and on the module's card. */
export function textIssues(label, text) {
  const issues = [];
  const bad = (message) => issues.push(`${label} ${message}`);
  if (text.includes('—')) bad('has an em dash: use a full stop or a colon');
  if (text.includes('...')) bad('has three dots: use the single character …');
  if (CONTRACTION.test(text)) bad('has a contraction: write the words out');
  if (text.includes('!')) bad('has an exclamation mark');
  if (/Numbat/.test(text)) bad('names Numbat: say what the module holds');
  const plain = text.replaceAll('standard library', 'standard collection');
  for (const [word, say] of BANNED_WORDS) {
    if (word === 'press' && /press [A-Z]/.test(plain)) continue;
    if (new RegExp(`\\b${word}\\b`, 'i').test(plain)) bad(`has "${word}": say ${say}`);
  }
  for (const sentence of text.split(/(?<=[.?])\s+/)) {
    const words = sentence.split(/\s+/).length;
    if (words > MAX_SENTENCE_WORDS)
      bad(`has a sentence of ${words} words (at most ${MAX_SENTENCE_WORDS}): "${sentence.slice(0, 40)}…"`);
  }
  return issues;
}

/** A count rate's unit, as Numbat prints it, and the word its name must carry. */
const RATE_WORDS = [
  [/^request\//, 'requests'],
  [/^operation\//, 'ops'],
  [/^message\//, 'msgs'],
  [/^record\//, 'records'],
  [/^row\//, 'rows'],
  [/^event\//, 'events'],
  [/^packet\//, 'packets'],
  [/^(IOPS|io\/)/, 'iops'],
  [/^dynamodb_write_request_unit\//, 'wcu'],
  [/^dynamodb_read_request_unit\//, 'rcu'],
  [/FLOP\//, 'flop'],
];
const PER_TIME = /\/(s|min|h|day)$|^IOPS$/;

/** `_qps`, `_rps` and `_tps` do not say what is counted, in any value. */
export function rateWordIssues(definitions) {
  return definitions
    .filter((d) => d.kind === 'let' && /_(qps|rps|tps)(_|$)/.test(d.name))
    .map((d) => `line ${d.line + 1}: ${d.name}: name the counted unit (_requests, _ops, …), not _qps/_rps/_tps`);
}

/** A value that is a count rate carries the word for what it counts. `values` is `Map(name → printed value)`. */
export function rateUnitIssues(definitions, values) {
  const issues = [];
  for (const d of definitions.filter((x) => x.kind === 'let')) {
    const printed = values.get(d.name);
    if (printed === undefined) continue;
    const unit = printed.replace(/^[-+\d._e]+\s*/, '');
    if (!PER_TIME.test(unit)) continue;
    const word = RATE_WORDS.find(([re]) => re.test(unit))?.[1];
    if (word && !new RegExp(`_${word}(_|$)`).test(d.name))
      issues.push(`line ${d.line + 1}: ${d.name} is in ${unit}, so its name must carry _${word}`);
  }
  return issues;
}

/** The executable examples of a module: its functions' `@example`s and its `# usage:` header lines. */
export function moduleExamples(text, definitions) {
  const examples = definitions.flatMap((d) =>
    examplesOfDefinition(d).map((e) => ({ directive: '@example', code: e.code })),
  );
  for (const m of text.matchAll(/^\s*#\s*usage:\s*(.+?)\s*$/gim)) examples.push({ directive: '# usage', code: m[1] });
  return examples;
}

/** The manifest that UnitPad reads, and the types of the modules it describes. */
export function manifestIssues(manifest, moduleTypes) {
  const issues = [];
  if (manifest.format !== 1)
    issues.push(`unitpad.json: the format is ${manifest.format}, and 1 is the one that UnitPad knows`);
  if (!Array.isArray(manifest.prelude) || manifest.prelude.length === 0)
    issues.push('unitpad.json: the prelude names no module');
  const types = (manifest.types ?? []).map((t) => t.id);
  if (new Set(types).size !== types.length) issues.push('unitpad.json: a menu type is listed twice');
  for (const type of moduleTypes)
    if (!types.includes(type))
      issues.push(
        `unitpad.json: the module type "${type}" has no entry in types, so UnitPad would show it under its folder name`,
      );
  return issues;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const modulesDir = join(root, 'modules');
  const manifest = JSON.parse(readFileSync(join(root, 'unitpad.json'), 'utf8'));
  const files = readModuleFiles(modulesDir);
  const reach = preludeReach(files, manifest.prelude);
  const ids = Object.keys(files).sort();
  const importable = ids.filter((id) => !reach.has(id));
  const results = new Map(ids.map((id) => [id, []]));
  const add = (id, ...issues) => results.get(id).push(...issues.flat());
  const global = [...manifestIssues(manifest, new Set(importable.map((id) => id.split('::')[0])))];

  const definitionsById = {};
  const unitHome = new Map();
  for (const id of ids) {
    const text = files[id];
    const { definitions, error } = readModule(text);
    definitionsById[id] = definitions;
    if (error) add(id, `Numbat cannot read the module: ${error}`);
    const name = id.split('::').pop();
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) add(id, `the file name ${name}.nbt is not kebab-case`);
    add(id, unitIssues(definitions));
    for (const d of definitions.filter((x) => x.kind === 'unit')) {
      if (!reach.has(id))
        add(
          id,
          `line ${d.line + 1}: unit ${d.name} is defined in a module; units live in a module that the prelude reaches (units/systems/)`,
        );
      for (const unit of unitNames(d)) {
        const home = unitHome.get(unit);
        if (home && home !== id)
          add(id, `line ${d.line + 1}: unit ${unit} is also defined in ${home}; a unit is defined once`);
        else unitHome.set(unit, id);
      }
    }
    if (reach.has(id)) continue;
    if (!definitions.some((d) => d.kind === 'let' || d.kind === 'fn')) add(id, 'defines no value or function');
    add(
      id,
      definitionIssues(definitions, id),
      importHeaderIssues(text, definitions, id),
      checkedIssues(text),
      highlightIssues(text, definitions),
      rateWordIssues(definitions),
    );
    for (const key of ['title', 'description']) {
      const value = new RegExp(`^#\\s*${key}:\\s*(.+?)\\s*$`, 'im').exec(text)?.[1];
      if (value === undefined) add(id, `the header has no \`# ${key}:\``);
      else add(id, textIssues(`# ${key}:`, value));
    }
  }

  // What needs the program: the examples, the unit of each value, and the currency.
  const probe = spawnSync(BIN, ['--version'], { encoding: 'utf8' });
  if (probe.error || probe.status !== 0) {
    const required = Boolean(process.env.REQUIRE_NUMBAT);
    console.log(
      `${required ? 'FAIL' : 'skip'} the numbat program was not found: its rules (examples, units of rates, currency) were not checked`,
    );
    if (required) global.push('the numbat program was not found');
  } else {
    const config = offlineConfigDir();
    process.on('exit', () => rmSync(config, { recursive: true, force: true }));
    const head = ['use units::systems'];
    if (parseResults(run(config, modulesDir, [...head, '2 USD'], 'always').output ?? '').length !== 1)
      global.push('`2 USD` does not work after `use units::systems`: the currency is missing');
    for (const id of importable) {
      const definitions = definitionsById[id];
      for (const example of moduleExamples(files[id], definitions)) {
        const out = run(config, modulesDir, [...head, `use ${id}`, example.code], 'always');
        if (parseResults(out.output ?? '').length !== 1)
          add(id, `${example.directive}: ${example.code}\n    ${firstError(out.output ?? out.error ?? '')}`);
      }
      const lets = definitions.filter((d) => d.kind === 'let');
      if (lets.length === 0) continue;
      const out = run(config, modulesDir, [...head, `use ${id}`, ...lets.map((d) => d.name)], 'always');
      const parsed = parseResults(out.output ?? '');
      if (parsed.length === lets.length)
        add(id, rateUnitIssues(definitions, new Map(lets.map((d, i) => [d.name, parsed[i].value]))));
    }
  }

  let failures = global.length;
  for (const message of global) console.log(`FAIL ${message}`);
  for (const id of ids) {
    const issues = results.get(id);
    const file = `modules/${id.replaceAll('::', '/')}.nbt`;
    if (issues.length === 0) console.log(`ok   ${file}`);
    else {
      failures++;
      console.log(`FAIL ${file}`);
      for (const issue of issues) console.log(`  ${issue}`);
    }
  }
  process.exit(failures > 0 ? 1 : 0);
}
