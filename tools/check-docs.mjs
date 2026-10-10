#!/usr/bin/env node
/**
 * Holds the documents to the writing rules (`docs/writing.md`): no em dash, no contraction, no vague word, sentences of at most 25
 * words, no semicolon in prose, a few banned terms, no heading that is a question, and nothing that belongs to the private
 * repository (it names UnitPad, not "the app", and has no path, command or link of the private repository). Plain Node, no
 * dependencies, so this repository runs it and the private repository imports it (`checkDocument`).
 *
 *   node tools/check-docs.mjs [file …]      (no files: the README, CONTRIBUTING and docs/*.md of this repository)
 *
 * A line that has to break a rule (a guide that quotes the words it bans) ends with `<!-- docs-check: ignore -->`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAX_WORDS = 25;

const VAGUE = /\b(simply|just|easily|quickly|please|oops|successfully|utilize|initiate)\b/i;
const CONTRACTION =
  /\b(\w+n't|it's|that's|there's|let's|here's|what's|i'm|you're|we're|they're|i've|you've|we've|they've|i'll|you'll|we'll|they'll)\b/i;
/** Words the glossary rules out for a person using UnitPad or a bundle of modules (`docs/writing.md`, "The words"). */
const BANNED_TERMS = [
  [/\b(users?|end users?|customers?)\b/i, 'say "reader"'],
  [/\blibrar(y|ies)\b/i, 'say "module" or "package"'],
  [/\bdeploy(s|ed|ing|ment)?\b/i, 'say "release"'],
];
/** What a document of this repository must not carry: the private repository's commands and its name for UnitPad. */
const PRIVATE_ONLY = [
  [/\bnpm run (check:[\w-]+|extract:[\w-]+|build:wasm|a11y|fuzz)\b/, 'a script of the private repository'],
  [/\bcheck:examples\b/, 'a check of the private repository'],
  [/\bthe app\b|\bapp's\b/i, 'say "UnitPad"'],
  [/github\.com\/unitpad\/unitpad(?![-\w])/i, 'a link into the private repository'],
  [/\bsrc\//, 'a path of the private repository'],
];

/** The prose of a Markdown text, as units to read: a paragraph, a list item, a heading, with what is not prose taken out. */
function units(text) {
  const body = text
    .replace(/<!--(?!\s*docs-check: ignore)[\s\S]*?-->/g, '')
    .replace(/^```[\s\S]*?^```/gm, (block) => '\n'.repeat(block.split('\n').length - 1));
  const out = [];
  let current = null;
  const flush = () => {
    if (current) out.push(current);
    current = null;
  };
  body.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    const ignore = /<!--\s*docs-check: ignore\s*-->/.test(line);
    const clean = line.replace(/<!--[\s\S]*?-->/g, '').trim();
    if (clean === '' || clean.startsWith('|') || clean.startsWith('```')) return flush();
    const heading = /^#{1,6}\s+(.*)$/.exec(clean);
    if (heading) {
      flush();
      return out.push({ kind: 'heading', text: heading[1], line: i + 1, ignore });
    }
    const item = /^([-*]|\d+\.)\s+(.*)$/.exec(clean);
    if (item) {
      flush();
      current = { kind: 'item', text: item[2], line: i + 1, ignore };
    } else if (current) {
      current.text += ` ${clean}`;
      current.ignore ||= ignore;
    } else current = { kind: 'para', text: clean, line: i + 1, ignore };
  });
  flush();
  return out;
}

/** A unit's text as it reads: a link is its words, a code span is one word. */
const plain = (text) =>
  text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`[^`]*`/g, 'X')
    .replace(/\*\*|__/g, '');

/** What is wrong with one document. */
export function checkDocument(text) {
  const problems = [];
  const add = (line, message) => problems.push({ line, message });
  for (const u of units(text)) {
    if (u.ignore) continue;
    const prose = plain(u.text);
    const code = u.text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'); // code spans kept: a path or a command is named there
    if (prose.includes('—')) add(u.line, 'an em dash: use a full stop or a colon');
    const contraction = CONTRACTION.exec(prose);
    if (contraction) add(u.line, `"${contraction[0]}" is a contraction: write it out`);
    const vague = VAGUE.exec(prose);
    if (vague) add(u.line, `"${vague[0]}" is a vague word`);
    for (const [re, hint] of BANNED_TERMS) {
      const found = re.exec(prose);
      if (found) add(u.line, `"${found[0]}": ${hint}`);
    }
    for (const [re, hint] of PRIVATE_ONLY) {
      const found = re.exec(code);
      if (found) add(u.line, `"${found[0]}" belongs to the private repository: ${hint}`);
    }
    if (u.kind === 'heading') {
      if (prose.trim().endsWith('?')) add(u.line, 'a heading is a noun or an imperative, not a question');
      continue;
    }
    if (u.kind === 'para' && prose.includes(';')) add(u.line, 'a semicolon in prose: write two sentences');
    for (const sentence of prose.split(/(?<=[.!?])\s+(?=[A-Z])/)) {
      const words = sentence.split(/\s+/).filter(Boolean).length;
      if (words > MAX_WORDS)
        add(u.line, `a sentence of ${words} words (at most ${MAX_WORDS}): "${sentence.slice(0, 50)}…"`);
    }
  }
  return problems;
}

/** The Markdown files of a directory, one level deep, and the `docs/` folder under it. */
function defaultFiles(root) {
  const files = [];
  for (const name of readdirSync(root)) if (name.endsWith('.md')) files.push(join(root, name));
  try {
    for (const name of readdirSync(join(root, 'docs'))) if (name.endsWith('.md')) files.push(join(root, 'docs', name));
  } catch {
    /* no docs folder */
  }
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const files = process.argv.length > 2 ? process.argv.slice(2) : defaultFiles(root);
  let failed = 0;
  for (const file of files) {
    const problems = checkDocument(readFileSync(file, 'utf8'));
    if (problems.length === 0) console.log(`ok   ${relative(process.cwd(), file)}`);
    else {
      failed++;
      console.log(`FAIL ${relative(process.cwd(), file)}`);
      for (const p of problems) console.log(`  line ${p.line}: ${p.message}`);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}
