/** The values check (`values.mjs`): how it reads the program's output, what a change needs, and, with the program, that these modules pass. */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { diffValues, examplesOf, parseInfo, parseResults, stepFor } from './values.mjs';

test('reads each result with its value and dimension, and a plain number as a scalar', () => {
  const output = [
    '  let a_x: Time = 100 ns', // a definition echoed by `use`: not a result
    '  a_x',
    '',
    '    = 100 ns    [Time]',
    '',
    '  a_n',
    '',
    '    = 10000',
    '',
    '    = 5500 request/s    [Request / Time]',
  ].join('\n');
  assert.deepEqual(parseResults(output), [
    { value: '100 ns', type: 'Time' },
    { value: '10000', type: 'Scalar' },
    { value: '5500 request/s', type: 'Request / Time' },
  ]);
});

test('has no result for an expression that failed', () => {
  assert.deepEqual(parseResults('  a_x\nerror: while type checking\n'), []);
});

test('reads the signature and the description of each function from `info`', () => {
  const output = [
    '  Function:    a_f (https://example.com/f)',
    '  Signature:   fn a_f<D: Dim>(x: D) -> D',
    '  Description: Returns x',
    '  ',
    '  Function:    a_g',
    '  Signature:   fn a_g() -> Scalar',
  ].join('\n');
  const info = parseInfo(output);
  assert.deepEqual(info.get('a_f'), { signature: 'fn a_f<D: Dim>(x: D) -> D', description: 'Returns x' });
  assert.deepEqual(info.get('a_g'), { signature: 'fn a_g() -> Scalar', description: '' });
});

test('finds the @example of each function, as Numbat reads the module', () => {
  const found = examplesOf(
    '@description("d")\n@example("a_f(1)", "a note")\n@example("a_f(2)")\nfn a_f(x: Scalar) -> Scalar = x\nlet a_v = 1',
  );
  assert.deepEqual([...found], [['a_f', ['a_f(1)', 'a_f(2)']]]);
});

const module = (value, type = 'Time', fn = {}) => ({
  m: {
    values: { m_x: { value, type } },
    functions: {
      m_f: {
        signature: 'fn m_f(x: Time) -> Time',
        description: 'd',
        examples: [{ code: 'm_f(1 s)', value: '1 s', type: 'Time' }],
        ...fn,
      },
    },
  },
});
const none = { dimensions: [], moved: [], docs: [] };

test('finds a changed dimension, a moved value, a changed signature, a moved example and a changed description', () => {
  assert.deepEqual(diffValues(module('1 s'), module('1 s')), none);
  assert.deepEqual(diffValues(module('1 s'), module('2 s')).moved, ['m.m_x: 1 s -> 2 s']);
  assert.deepEqual(diffValues(module('1 s'), module('1 m', 'Length')).dimensions, ['m.m_x: Time -> Length']);
  const signature = diffValues(module('1 s'), module('1 s', 'Time', { signature: 'fn m_f(x: Length) -> Time' }));
  assert.deepEqual(signature.dimensions, ['m.m_f: fn m_f(x: Time) -> Time -> fn m_f(x: Length) -> Time']);
  const example = diffValues(
    module('1 s'),
    module('1 s', 'Time', { examples: [{ code: 'm_f(1 s)', value: '2 s', type: 'Time' }] }),
  );
  assert.deepEqual(example.moved, ['m.m_f example m_f(1 s): 1 s -> 2 s']);
  assert.deepEqual(diffValues(module('1 s'), module('1 s', 'Time', { description: 'e' })).docs, [
    'm.m_f: the description changed',
  ]);
});

test('says nothing of a removed name or module, which `api.mjs` judges', () => {
  const gone = { m: { values: {}, functions: {} } };
  assert.deepEqual(diffValues(module('1 s'), gone), none);
  assert.deepEqual(diffValues(module('1 s'), {}), none);
});

test('a dimension or signature change is a major step (while the major is 0: minor), the rest a patch', () => {
  assert.equal(stepFor({ ...none, dimensions: ['x'] }, '1.0.0'), 'major');
  assert.equal(stepFor({ ...none, dimensions: ['x'] }, '0.3.0'), 'minor');
  assert.equal(stepFor({ ...none, moved: ['x'] }, '1.0.0'), 'patch');
  assert.equal(stepFor({ ...none, docs: ['x'] }, '1.0.0'), 'patch');
  assert.equal(stepFor(none, '1.0.0'), null);
});

const program =
  process.env.NUMBAT_BIN ?? (existsSync(new URL('../.numbat/numbat', import.meta.url)) ? undefined : 'numbat');
const available = program === undefined || !spawnSync(program, ['--version']).error;

test(
  'these modules load in the official program and match values.json',
  { skip: !available && 'the numbat program is not installed' },
  () => {
    const run = execFileSync('node', [new URL('./values.mjs', import.meta.url).pathname], { encoding: 'utf8' });
    assert.match(run, /^ok/);
  },
);
