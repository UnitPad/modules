import js from '@eslint/js';
import globals from 'globals';

// The tools are plain Node scripts, so one recommended rule set and the Node globals are all they need.
export default [
  { ignores: ['node_modules/**', '.numbat/**', 'tools/numbat/**'] },
  js.configs.recommended,
  { files: ['tools/**/*.mjs', 'eslint.config.js'], languageOptions: { globals: { ...globals.node } } },
];
