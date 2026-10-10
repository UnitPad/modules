# The Numbat build used by the checks

`numbat_wasm.js` and `numbat_wasm_bg.wasm` are [Numbat](https://github.com/sharkdp/numbat) v1.24.0 compiled to WebAssembly, with three
patches. The checks use it to read a module the way Numbat reads it: the syntax tree of the file, from which the style checks read each
definition, its decorators and its types. It is a tool of this repository. It is not in the npm package.

The values that a module holds are checked with the official `numbat` program, not with this build (`tools/values.mjs`). Both must agree.

The patches are published here so that anyone can read what differs from Numbat, and can rebuild the module and compare it.

## The patches

| File | What it changes |
|---|---|
| `patches/numbat-reflection.patch` | Adds functions that give the tokens, the syntax tree and the table of names of a text as data. The checks use this one |
| `patches/numbat-implicit-let.patch` | Reads `name = value` as a definition, as `let` does. The modules always write `let`, so this does not change them |
| `patches/numbat-format-precision.patch` | Prints 12 significant digits where Numbat prints 6 |

## What is here

| File | What it is |
|---|---|
| `numbat_wasm_bg.wasm` | The module. SHA-256 `c278908f5448dd246c42c827aab879a277ecb2bf3d3493dfbb563eff7ba51f37` |
| `numbat_wasm.js` | The loader that `wasm-pack` writes. SHA-256 `6db3e5f8a5366e153af1c449f590ff5adac4fe8fafbf4fdd4a3db95ded9db40e` |
| `patches/` | The three patches above, to apply to Numbat v1.24.0 |
| `LICENSE-MIT`, `LICENSE-APACHE` | The licences of Numbat, which these files carry |
| `third-party-licenses.txt` | The notices of the Rust crates that the module is made of |

## Rebuild it

Not run in this repository. You need Rust with the `wasm32-unknown-unknown` target and `wasm-pack`.

```bash
git clone --branch v1.24.0 --depth 1 https://github.com/sharkdp/numbat.git
cd numbat
for p in /path/to/this/repository/tools/numbat/patches/*.patch; do git apply "$p"; done
cd numbat-wasm
RUSTFLAGS='--cfg getrandom_backend="wasm_js"' CARGO_PROFILE_RELEASE_CODEGEN_UNITS=1 wasm-pack build --target=web --out-dir=pkg
```

Then copy `pkg/numbat_wasm.js` and `pkg/numbat_wasm_bg.wasm` here, and update the two checksums above. A rebuild may not match the checksums
byte for byte, because a compiler version can change the output. The patches are what to compare.
