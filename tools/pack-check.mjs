#!/usr/bin/env node
/**
 * What `npm publish` would send, held to the list of what the package is: the numbers (`modules/**.nbt`), the manifest UnitPad
 * reads (`unitpad.json`), and what npm always adds (`package.json`, `README.md`, `LICENSE`). Everything else in this repository is
 * for the people who work on it (the style guide, the checks, the templates, the tools) and never ships. A file that slipped in, or
 * a module that did not, fails here, before a release and not after one: a published version cannot be taken back.
 *
 *   node tools/pack-check.mjs
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

/** The files a release is allowed to hold. */
const SHIPPED = [/^modules\/.+\.nbt$/, /^unitpad\.json$/, /^package\.json$/, /^README\.md$/, /^LICENSE$/];

const [pack] = JSON.parse(
  execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: root, encoding: 'utf8' }),
);
const packed = pack.files.map((f) => f.path).sort();

const onDisk = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (name.endsWith('.nbt')) onDisk.push(relative(root, full).split('\\').join('/'));
  }
})(join(root, 'modules'));

const problems = [
  ...packed.filter((f) => !SHIPPED.some((re) => re.test(f))).map((f) => `ships ${f}, which is not part of the package`),
  ...onDisk.filter((f) => !packed.includes(f)).map((f) => `does not ship ${f}`),
  ...(packed.includes('README.md') ? [] : ['has no README.md, so its page on npm would be empty']),
];

if (problems.length > 0) {
  for (const p of problems) console.log(`FAIL ${p}`);
  process.exit(1);
}
console.log(
  `ok   ${packed.length} files, ${(pack.size / 1024).toFixed(1)} kB packed: ${onDisk.length} modules, the manifest, README.md`,
);
