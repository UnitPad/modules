#!/usr/bin/env node
/**
 * Which modules are due a check against their sources: those that say `# checked: unverified`, and those last checked more than
 * `--months` ago (default 12). Plain Node, no dependencies, so the modules repository runs it on a schedule and opens an issue
 * from the list. It never runs in the UnitPad's build (a build must not depend on today's date).
 *
 *   node tools/stale.mjs [--months 12] [--fail]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('..', import.meta.url)), 'modules');
const args = process.argv.slice(2);
const months = Number(args[args.indexOf('--months') + 1]) || 12;

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (name.endsWith('.nbt')) files.push(full);
  }
})(root);

const now = new Date();
const age = (month) => {
  const [y, m] = month.split('-').map(Number);
  return (now.getUTCFullYear() - y) * 12 + (now.getUTCMonth() + 1 - m);
};

const due = [];
for (const file of files.sort()) {
  const text = readFileSync(file, 'utf8');
  const found = /^#\s*checked:\s*(\S+)\s*$/im.exec(text)?.[1];
  const id = relative(root, file)
    .replace(/\.nbt$/, '')
    .replaceAll('/', '::');
  if (found === undefined) continue; // a shared unit module: it holds no numbers to check
  if (found === 'unverified') due.push({ id, why: 'never checked' });
  else if (age(found) > months) due.push({ id, why: `last checked ${found}, ${age(found)} months ago` });
}

if (due.length === 0) console.log(`Every module was checked in the last ${months} months.`);
else for (const d of due) console.log(`${d.id}: ${d.why}`);
process.exit(due.length > 0 && args.includes('--fail') ? 1 : 0);
