/**
 * What Numbat's own parser says a module file defines. The wasm build in `tools/numbat/` gives the syntax tree of a text; this file
 * reads definitions out of it: each value, function, unit and dimension, with its decorators, and for a function whether each
 * parameter and the result are typed, and for a unit whether it names its dimension. No pattern runs over the text.
 */
import { readFileSync } from 'node:fs';
import { initSync, lex, parse } from '../numbat/numbat_wasm.js';

initSync({ module: new WebAssembly.Module(readFileSync(new URL('../numbat/numbat_wasm_bg.wasm', import.meta.url))) });

const isNode = (j) => typeof j === 'object' && j !== null && !Array.isArray(j) && typeof j.t === 'string';
const isSpan = (j) =>
  typeof j === 'object' &&
  j !== null &&
  !Array.isArray(j) &&
  typeof j.start === 'number' &&
  typeof j.end === 'number' &&
  !('t' in j);

/** The smallest span that holds every span inside a value (null for one with none). */
function spanOf(j) {
  let found = null;
  const visit = (v) => {
    if (v === null || v === undefined || typeof v !== 'object') return;
    if (Array.isArray(v)) return v.forEach(visit);
    if (isSpan(v)) {
      found = found
        ? { start: Math.min(found.start, v.start), end: Math.max(found.end, v.end) }
        : { start: v.start, end: v.end };
      return;
    }
    Object.values(v).forEach(visit);
  };
  visit(j);
  return found;
}

/** A statement as the parser wraps it: the node of a variant around the node of its fields. */
function unwrap(node) {
  const inner = node.a?.length === 1 ? node.a[0] : undefined;
  return isNode(inner) && inner.t === node.t && inner.f ? inner : node;
}

const textField = (node, name) => (typeof node.f?.[name] === 'string' ? node.f[name] : undefined);
const nodesIn = (j) => (Array.isArray(j) ? j.filter(isNode) : []);

/** `MetricPrefixes` → `metric_prefixes`: a decorator is named in the source as its kind is in the tree, in snake case. */
const snake = (kind) => kind.replace(/(?<=[a-z0-9])([A-Z])/g, '_$1').toLowerCase();

/** The text leaves of a value, in order: a decorator's arguments (a list of aliases is its names). */
function strings(j, out = []) {
  if (typeof j === 'string') out.push(j);
  else if (Array.isArray(j)) j.forEach((x) => strings(x, out));
  else if (j && typeof j === 'object' && !isSpan(j)) Object.values(j).forEach((x) => strings(x, out));
  return out;
}

const decoratorOf = (d) => ({ name: snake(d.t), args: strings(d.a) });
const decoratorsOf = (node) => nodesIn(node.f?.decorators).map(decoratorOf);

/** The tokens, the trivia (comments) and the errors of a text. */
export const lexText = (text) => JSON.parse(lex(text));

/** The definitions of a module text, and the parser's first error (or null). */
export function readModule(text) {
  const parsed = JSON.parse(parse(text));
  const lineOf = (offset) => text.slice(0, offset).split('\n').length - 1;
  const definitions = [];
  for (const raw of parsed.statements) {
    const node = unwrap(raw);
    if (node.t === 'DefineFunction') {
      const params = (Array.isArray(node.f?.parameters) ? node.f.parameters : []).map((p) => ({
        name: String(p[1]),
        annotated: p[2] !== null && p[2] !== undefined,
      }));
      definitions.push({
        kind: 'fn',
        name: textField(node, 'function_name') ?? '',
        line: lineOf(spanOf(node.f?.function_name_span)?.start ?? 0),
        decorators: decoratorsOf(node),
        params,
        returns: node.f?.return_type_annotation !== null && node.f?.return_type_annotation !== undefined,
      });
    } else if (node.t === 'DefineVariable') {
      definitions.push({
        kind: 'let',
        name: textField(node, 'identifier') ?? '',
        line: lineOf(spanOf(node.f?.identifier_span)?.start ?? 0),
        decorators: decoratorsOf(node),
      });
    } else if (node.t === 'DefineDerivedUnit') {
      definitions.push({
        kind: 'unit',
        name: textField(node, 'identifier') ?? '',
        line: lineOf(spanOf(node.f?.identifier_span)?.start ?? 0),
        decorators: decoratorsOf(node),
        base: false,
        typed: node.f?.type_annotation !== null && node.f?.type_annotation !== undefined,
      });
    } else if (node.t === 'DefineBaseUnit') {
      const [span, name, dimension, decorators] = node.a ?? [];
      definitions.push({
        kind: 'unit',
        name: typeof name === 'string' ? name : '',
        line: lineOf(spanOf(span)?.start ?? 0),
        decorators: nodesIn(decorators).map(decoratorOf),
        base: true,
        typed: dimension !== null && dimension !== undefined,
      });
    } else if (node.t === 'DefineDimension') {
      const [span, name] = node.a ?? [];
      definitions.push({
        kind: 'dimension',
        name: typeof name === 'string' ? name : '',
        line: lineOf(spanOf(span)?.start ?? 0),
        decorators: [],
      });
    }
  }
  return { definitions, error: parsed.errors[0]?.message ?? null };
}

/** The first argument of a definition's decorator of that name (`@description("…")`), if it has one. */
export const decoratorArg = (d, name) => d.decorators.find((x) => x.name === name)?.args[0];

/** A definition's `@example`s: the code, and the note that may follow it. */
export const examplesOfDefinition = (d) =>
  d.decorators.filter((x) => x.name === 'example').map((x) => ({ code: x.args[0], note: x.args[1] }));

/** A unit's name and its aliases (the parser lists an alias's prefix kind among them, as `AcceptsPrefix`). */
export const unitNames = (d) => [
  d.name,
  ...d.decorators.filter((x) => x.name === 'aliases').flatMap((x) => x.args.filter((a) => a !== 'AcceptsPrefix')),
];

/** The constants a module features: `# highlight: Label` above a definition. `{ label, line, next }` with the definition that follows. */
export function highlightsOf(text, definitions) {
  const lineOf = (offset) => text.slice(0, offset).split('\n').length - 1;
  const out = [];
  for (const [kind, start, end] of lexText(text).trivia) {
    if (kind !== 'comment') continue;
    const m = /^#\s*highlight:\s*(.*?)\s*$/i.exec(text.slice(start, end));
    if (!m) continue;
    const line = lineOf(start);
    const next = definitions.filter((d) => d.line > line).sort((a, b) => a.line - b.line)[0];
    out.push({ label: m[1], line, next });
  }
  return out;
}
