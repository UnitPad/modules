/** The names check (`api.mjs`): how it reads a module, what it says a change needs, and that this repository passes. Run with `pnpm test`. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { apiOf, bumpedEnough, diffApi, namesOf, preludeReach, requiredStep } from './api.mjs';

test('reads values, functions, units with their aliases, and dimensions', () => {
  const names = namesOf(`
# a comment: let ignored = 1
@description("x")
let a_b = 1 s
fn a_f(x: Scalar) -> Scalar = x
dimension Request

@name("Request")
@metric_prefixes
@aliases(req, reqs: short, requests)
unit request: Request

@aliases(users) unit user
`);
  assert.deepEqual(names, {
    values: ['a_b'],
    functions: ['a_f'],
    units: ['req', 'reqs', 'request', 'requests', 'user', 'users'],
    dimensions: ['Request'],
  });
});

test('finds what the prelude reaches: a module of only use lines stands for those it lists', () => {
  const files = {
    all: '# every sheet\nuse one\nuse two::three  # after one',
    one: 'unit one',
    'two::three': 'unit t',
    other: 'unit o',
  };
  assert.deepEqual([...preludeReach(files, ['all'])].sort(), ['all', 'one', 'two::three']);
});

const api = (extra = {}) =>
  apiOf({ base: 'let base_a = 1\nfn base_f(x: Scalar) -> Scalar = x', 'u::k': 'unit k', ...extra }, ['u::k']);

test('a removed name, module or unit needs a major step; an added one a minor step', () => {
  const before = api();
  const gone = diffApi(before, apiOf({ base: 'let base_a = 1', 'u::k': 'unit k' }, ['u::k']));
  assert.deepEqual(gone.removed, ['function base.base_f']);
  assert.equal(requiredStep(gone, '1.2.0'), 'major');
  assert.equal(requiredStep(diffApi(before, apiOf({ 'u::k': 'unit k' }, ['u::k'])), '1.2.0'), 'major');
  const more = diffApi(before, api({ extra: 'let extra_x = 1' }));
  assert.equal(requiredStep(more, '1.2.0'), 'minor');
  assert.equal(requiredStep(diffApi(before, before), '1.2.0'), null);
});

test('a unit added to the prelude takes a name in every sheet, so it is a major step', () => {
  const before = api();
  const after = apiOf({ base: 'let base_a = 1', 'u::k': 'unit k\nunit k2' }, ['u::k']);
  const diff = diffApi(before, after);
  assert.deepEqual(diff.reserved, ['unit u::k.k2']);
  assert.equal(requiredStep(diff, '1.0.0'), 'major');
});

test('while the major is 0, every step is one place lower', () => {
  const removed = { removed: ['x'], added: [], reserved: [] };
  const added = { removed: [], added: ['x'], reserved: [] };
  assert.equal(requiredStep(removed, '0.4.1'), 'minor');
  assert.equal(requiredStep(added, '0.4.1'), 'patch');
});

test('says whether the version took the step', () => {
  assert.equal(bumpedEnough('1.2.3', '2.0.0', 'major'), true);
  assert.equal(bumpedEnough('1.2.3', '1.3.0', 'major'), false);
  assert.equal(bumpedEnough('1.2.3', '1.3.0', 'minor'), true);
  assert.equal(bumpedEnough('1.2.3', '1.2.3', 'patch'), false);
  assert.equal(bumpedEnough('1.2.3', '1.2.4', 'patch'), true);
  assert.equal(bumpedEnough('0.1.0', '0.2.0', 'minor'), true);
  assert.equal(bumpedEnough('1.2.3', '0.9.9', 'patch'), false);
});

test('this repository passes its own check, and its snapshot is the release', () => {
  const run = (...args) =>
    execFileSync('node', [new URL('./api.mjs', import.meta.url).pathname, ...args], { encoding: 'utf8' });
  assert.match(run(), /^ok/);
  assert.match(run('--release'), /^ok/);
});
