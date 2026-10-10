#!/usr/bin/env node
/**
 * Whether the sources the modules cite (`@url("…")` and `# source:`) still answer. Plain Node, no dependencies; the modules
 * repository runs it on a schedule, never on a pull request (a site being down is not the contributor's fault) and never in the
 * UnitPad's build. A source that fails is listed, to be replaced or archived, not deleted from the module.
 *
 *   node tools/links.mjs [--list]      (--list prints the addresses and checks none)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('..', import.meta.url)), 'modules');
const urls = new Map(); // address -> the modules citing it

(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (name.endsWith('.nbt')) {
      const text = readFileSync(full, 'utf8');
      const id = relative(root, full)
        .replace(/\.nbt$/, '')
        .replaceAll('/', '::');
      const found = [...text.matchAll(/@url\("([^"]+)"\)/g), ...text.matchAll(/^#\s*source:\s*(\S+)\s*$/gim)].map(
        (m) => m[1],
      );
      for (const url of found) urls.set(url, [...new Set([...(urls.get(url) ?? []), id])]);
    }
  }
})(root);

if (process.argv.includes('--list')) {
  for (const url of [...urls.keys()].sort()) console.log(url);
  process.exit(0);
}

/** A site that refuses, limits or is slow for a script says nothing about whether the page is there: listed apart, never a failure. */
const UNKNOWN = new Set([401, 403, 429]);
const HEADERS = { 'user-agent': 'unitpad-modules-link-check (https://github.com/UnitPad/modules)' };

const check = async (url) => {
  let last = 'no answer';
  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await fetch(url, {
        method,
        headers: HEADERS,
        redirect: 'follow',
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) return null;
      last = { status: res.status };
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
  }
  return last;
};

const failed = [];
const unknown = [];
const queue = [...urls.keys()];
await Promise.all(
  Array.from({ length: 4 }, async () => {
    for (let url = queue.shift(); url !== undefined; url = queue.shift()) {
      const problem = await check(url);
      if (problem === null) continue;
      const line = `${typeof problem === 'string' ? problem : `HTTP ${problem.status}`}  ${url}  (${urls.get(url).join(', ')})`;
      const slow = typeof problem === 'string' && /timeout|aborted/i.test(problem); // a large file, or a slow site, is not a missing page
      (slow || (typeof problem !== 'string' && UNKNOWN.has(problem.status)) ? unknown : failed).push(line);
    }
  }),
);
for (const line of failed.sort()) console.log(`FAILED   ${line}`);
for (const line of unknown.sort()) console.log(`unknown  ${line}`);
console.log(
  `${urls.size} sources: ${failed.length} did not answer, ${unknown.length} could not be told (a site that limits scripts).`,
);
process.exit(failed.length > 0 ? 1 : 0);
