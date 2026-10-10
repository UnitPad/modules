/** The style check (`style.mjs`): each rule fires on a small bad module, and these modules pass them all. Run with `npm test`. */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { readModule } from './lib/definitions.mjs';
import {
  checkedIssues,
  definitionIssues,
  highlightIssues,
  importHeaderIssues,
  manifestIssues,
  moduleExamples,
  rateUnitIssues,
  rateWordIssues,
  textIssues,
  unitIssues,
} from './style.mjs';

const read = (text) => readModule(text).definitions;

test('a value and a function start with the module path and have a description', () => {
  const defs = read('@description("d")\nlet m_a = 1\nlet other_b = 2\n@description("d")\nlet m_c = 3\nlet m_d = 4');
  assert.deepEqual(definitionIssues(defs, 'm'), [
    'line 3: other_b is not prefixed with "m_"',
    'line 3: other_b has no @description',
    'line 6: m_d has no @description',
  ]);
  assert.deepEqual(definitionIssues(read('@description("d")\nlet a_b_x = 1'), 'a::b'), []);
});

test('a public function has an example and a type on every parameter and on its result', () => {
  const ok = '@description("d")\n@example("m_f(1)")\nfn m_f(x: Scalar) -> Scalar = x';
  assert.deepEqual(definitionIssues(read(ok), 'm'), []);
  assert.match(definitionIssues(read(ok.replace('@example("m_f(1)")\n', '')), 'm')[0], /no @example/);
  assert.match(definitionIssues(read(ok.replace('x: Scalar', 'x')), 'm')[0], /annotate every parameter/);
  assert.match(definitionIssues(read(ok.replace(' -> Scalar', '')), 'm')[0], /annotate every parameter/);
});

test('a count unit has its own dimension and no metric prefixes, except FLOP', () => {
  assert.deepEqual(unitIssues(read('dimension Req\nunit req: Req')), []);
  assert.match(unitIssues(read('unit req'))[0], /own dimension/);
  assert.match(unitIssues(read('dimension Req\n@metric_prefixes\nunit req: Req'))[0], /metric_prefixes/);
  assert.deepEqual(unitIssues(read('dimension F\n@metric_prefixes\nunit FLOP: F')), []);
  assert.deepEqual(unitIssues(read('@metric_prefixes\nunit IOPS: Io / Time = io / second')), []); // derived: not a count
});

test('the import line is the one the guide gives, with "and functions" when there is one', () => {
  const header = '# Import with:  use m    then use the m_* values';
  assert.deepEqual(importHeaderIssues(header, read('let m_a = 1'), 'm'), []);
  assert.match(importHeaderIssues(header, read('fn m_f(x: Scalar) -> Scalar = x'), 'm')[0], /and functions/);
  assert.deepEqual(importHeaderIssues(`${header} and functions`, read('fn m_f(x: Scalar) -> Scalar = x'), 'm'), []);
  assert.deepEqual(
    importHeaderIssues('# Import with:  use a::b    then use the a_b_* values', read('let a_b_x = 1'), 'a::b'),
    [],
  );
});

test('`# checked:` is a month that is not in the future, or `unverified`', () => {
  assert.deepEqual(checkedIssues('# checked: 2026-10'), []);
  assert.deepEqual(checkedIssues('# checked: unverified'), []);
  assert.match(checkedIssues('# title: x')[0], /no `# checked/);
  assert.match(checkedIssues('# checked: 2026-13')[0], /not a month/);
  assert.match(checkedIssues('# checked: 2099-01')[0], /future/);
});

test('a highlight has a label and stands above a value, not a function', () => {
  const value = '# highlight: Key\n@description("d")\nlet m_k = 1';
  assert.deepEqual(highlightIssues(value, read(value)), []);
  const fn = '# highlight: Key\nfn m_f(x: Scalar) -> Scalar = x';
  assert.match(highlightIssues(fn, read(fn))[0], /not above a value/);
  const empty = '# highlight:\nlet m_k = 1';
  assert.match(highlightIssues(empty, read(empty))[0], /needs a label/);
});

test('a title or description has no em dash, three dots, contraction, exclamation mark, banned word or Numbat', () => {
  assert.deepEqual(textIssues('# title:', 'Latency (hardware)'), []);
  assert.match(textIssues('# title:', 'A — B')[0], /em dash/);
  assert.match(textIssues('# title:', 'Wait...')[0], /three dots/);
  assert.match(textIssues('# title:', "It doesn't")[0], /contraction/);
  assert.match(textIssues('# title:', 'Fast!')[0], /exclamation/);
  assert.match(textIssues('# title:', "Numbat's units")[0], /Numbat/);
  assert.match(textIssues('# title:', 'A library of numbers')[0], /library.*module/);
  assert.deepEqual(textIssues('# title:', 'Then press Tab'), []);
  assert.deepEqual(textIssues('# title:', 'The standard library is fine'), []);
});

test('a description keeps each sentence to 20 words', () => {
  const words = (n) => Array.from({ length: n }, () => 'word').join(' ');
  assert.deepEqual(textIssues('# description:', `${words(20)}. ${words(20)}.`), []);
  assert.match(textIssues('# description:', `${words(21)}.`)[0], /21 words/);
});

test('a count rate carries the word for what it counts, and no name says qps, rps or tps', () => {
  const defs = read('let m_cache_qps = 1\nlet m_get_requests = 1\nlet m_get = 1');
  assert.match(rateWordIssues(defs)[0], /_qps/);
  const values = new Map([
    ['m_get_requests', '5 request/s'],
    ['m_get', '5 request/s'],
    ['m_size', '5 GB'],
  ]);
  assert.deepEqual(rateUnitIssues(read('let m_get_requests = 1\nlet m_get = 1\nlet m_size = 1'), values), [
    'line 2: m_get is in request/s, so its name must carry _requests',
  ]);
  assert.deepEqual(rateUnitIssues(read('let m_iops_x = 1'), new Map([['m_iops_x', '3000 IOPS']])), []);
});

test('the examples of a module are its @examples and its usage lines', () => {
  const text =
    '# usage: m_a * 2 -> s\n@description("d")\n@example("m_f(1)", "note")\nfn m_f(x: Scalar) -> Scalar = x\nlet m_a = 1 s';
  assert.deepEqual(moduleExamples(text, read(text)), [
    { directive: '@example', code: 'm_f(1)' },
    { directive: '# usage', code: 'm_a * 2 -> s' },
  ]);
});

test('the manifest has a known format, a prelude, unique types, and a type for every module', () => {
  const manifest = { format: 1, prelude: ['units::systems'], types: [{ id: 'latency', title: 'Latency' }] };
  assert.deepEqual(manifestIssues(manifest, new Set(['latency'])), []);
  assert.match(manifestIssues({ ...manifest, format: 2 }, new Set())[0], /format/);
  assert.match(manifestIssues({ ...manifest, prelude: [] }, new Set())[0], /prelude/);
  assert.match(manifestIssues({ ...manifest, types: [...manifest.types, ...manifest.types] }, new Set())[0], /twice/);
  assert.match(manifestIssues(manifest, new Set(['latency', 'cost']))[0], /"cost"/);
});

const program =
  process.env.NUMBAT_BIN ?? (existsSync(new URL('../.numbat/numbat', import.meta.url)) ? undefined : 'numbat');
const available = program === undefined || !spawnSync(program, ['--version']).error;

test(
  'these modules pass every rule, with the official program when it is installed',
  { skip: !available && 'the numbat program is not installed' },
  () => {
    const out = execFileSync('node', [new URL('./style.mjs', import.meta.url).pathname], { encoding: 'utf8' });
    assert.doesNotMatch(out, /^FAIL/m);
  },
);
