#!/usr/bin/env node
/**
 * Installs the official `numbat` program at the version `numbat-version.json` names, into `.numbat/` in this repository: it
 * downloads that release from GitHub, refuses it unless its SHA-256 is the one in the file, and unpacks it. CI runs it, and so can
 * you. `tools/values.mjs` then finds the program there. In GitHub Actions it also puts the program's path in `NUMBAT_BIN`.
 *
 *   node tools/install-numbat.mjs
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const { version, sha256 } = JSON.parse(readFileSync(join(root, 'numbat-version.json'), 'utf8'));

const TARGETS = {
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
  'darwin-x64': 'x86_64-apple-darwin',
  'darwin-arm64': 'aarch64-apple-darwin',
};
const target = TARGETS[`${process.platform}-${process.arch}`];
if (!target) {
  console.log(
    `FAIL no release of numbat for ${process.platform} ${process.arch}: install version ${version} yourself and set NUMBAT_BIN`,
  );
  process.exit(1);
}

const dir = join(root, '.numbat');
const bin = join(dir, 'numbat');
const have = existsSync(bin) ? execFileSync(bin, ['--version'], { encoding: 'utf8' }).trim() : '';

if (have !== `numbat ${version}`) {
  const url = `https://github.com/sharkdp/numbat/releases/download/v${version}/numbat-v${version}-${target}.tar.gz`;
  const response = await fetch(url);
  if (!response.ok) {
    console.log(`FAIL ${url}: HTTP ${response.status}`);
    process.exit(1);
  }
  const archive = Buffer.from(await response.arrayBuffer());
  const actual = createHash('sha256').update(archive).digest('hex');
  if (actual !== sha256[target]) {
    console.log(`FAIL the archive for ${target} has SHA-256 ${actual}, not ${sha256[target]}: it is not installed`);
    process.exit(1);
  }
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'numbat.tar.gz'), archive);
  execFileSync('tar', ['-xzf', 'numbat.tar.gz'], { cwd: dir });
  copyFileSync(join(dir, `numbat-v${version}-${target}`, 'numbat'), bin);
  chmodSync(bin, 0o755);
  rmSync(join(dir, 'numbat.tar.gz'));
}

console.log(`ok   ${execFileSync(bin, ['--version'], { encoding: 'utf8' }).trim()} at ${bin}`);
if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `NUMBAT_BIN=${bin}\n`);
