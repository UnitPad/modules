/** The documents check (`check-docs.mjs`), held to its own rules: what it passes, and what it fails. Run with `npm test`. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkDocument, MAX_WORDS } from './check-docs.mjs';

const messages = (text) => checkDocument(text).map((p) => p.message);

test('passes plain prose, with a code span counted as one word', () => {
  assert.deepEqual(messages('# Change a module\n\nEdit `modules/latency/hardware.nbt`. Run the check.'), []);
});

test('fails an em dash, a contraction and a vague word', () => {
  assert.match(messages('A thing — here.')[0], /em dash/);
  assert.match(messages("It doesn't work.")[0], /contraction/);
  assert.match(messages('Simply run it.')[0], /vague/);
});

test('fails a sentence over the limit, and counts each list item on its own', () => {
  const words = (n) => Array.from({ length: n }, () => 'word').join(' ');
  assert.match(messages(`${words(MAX_WORDS + 1)}.`)[0], /words/);
  assert.deepEqual(messages(`- ${words(20)}.\n- ${words(20)}.`), []);
});

test('allows a semicolon in a list item and a table, not in a paragraph', () => {
  assert.match(messages('One; two.')[0], /semicolon/);
  assert.deepEqual(messages('- One; two.'), []);
  assert.deepEqual(messages('| a; b | c |'), []);
});

test('ignores code blocks, and a line that says so', () => {
  assert.deepEqual(messages('```text\nIt doesn’t matter — here; at all\n```'), []);
  assert.deepEqual(messages('Not "simply". <!-- docs-check: ignore -->'), []);
});

test('fails a heading that is a question, and a banned term', () => {
  assert.match(messages('# Why not?')[0], /question/);
  assert.match(messages('The user reads it.')[0], /reader/);
});

test('requires UnitPad by name, and nothing of the private repository', () => {
  assert.match(messages('Update the app.')[0], /UnitPad/);
  assert.match(messages('Run `npm run check:examples`.')[0], /private/);
  assert.deepEqual(messages('Run `npm run check`.'), []);
  assert.match(messages('See `src/modules/index.ts`.')[0], /private/);
  assert.match(messages('See https://github.com/unitpad/unitpad/blob/main/x.md.')[0], /private/);
});
