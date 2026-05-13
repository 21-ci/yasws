# YASWS Examples

Three runnable examples showing how to use YASWS v2 on different transports.

| Example | Transport | What it shows |
| --- | --- | --- |
| [`01-hello-node`](./01-hello-node) | `node:http` | Smallest possible YASWS app. Decorators + a handler. |
| [`02-hello-wasi`](./02-hello-wasi) | WASI HTTP component | Same idea, compiled to a `.wasm` component, served by `wasmtime serve`. |
| [`03-portable-rest`](./03-portable-rest) | Both | A CRUD-style REST API. **One handler file**, two entrypoints — same code runs on Node and as a WASM component. |

## Prerequisites

### For all examples

- **Node.js 20+** (uses native `fetch`, `Buffer`, ESM with NodeNext resolution)
- `npm`

### For the WASI examples (`02-hello-wasi`, `03-portable-rest`)

You'll need a WASI HTTP host and a tool to build the component.

- **wasmtime ≥ 22.0** — host runtime. Install:
  ```sh
  curl https://wasmtime.dev/install.sh -sSf | bash
  # or:  brew install wasmtime
  ```
  Verify: `wasmtime --version` and `wasmtime serve --help`.

- **jco + componentize-js** — JS-to-component compiler. Each example installs them as devDeps:
  ```sh
  npm install
  ```
  They're pulled in via `@bytecodealliance/jco` and `@bytecodealliance/componentize-js`.

- **esbuild** — used to bundle the entry file before handing it to `jco componentize`. (componentize-js runs SpiderMonkey inside the resulting component; the input must be a single self-contained ESM file with `wasi:*` imports left as bare specifiers. esbuild handles both.)

## YASWS dep resolution

All examples reference YASWS via a local path:

```jsonc
"dependencies": {
  "yasws": "file:../.."
}
```

Run `npm install` from the example directory; it resolves to the repo root. Once YASWS ships to npm, swap this for a `"yasws": "^2.0.0"` version range.

## Workflow at a glance

### Node example

```
src/index.ts  ──tsc──▶  dist/index.js  ──node──▶  HTTP server
```

### WASI example

```
src/index.ts  ──tsc──▶  dist/index.js  ──esbuild──▶  build/bundle.js
                                                       │
                                                       ▼
                                              jco componentize
                                                       │
                                                       ▼
                                                build/app.wasm
                                                       │
                                                       ▼
                                              wasmtime serve app.wasm
                                                       │
                                                       ▼
                                              http://127.0.0.1:8080
```

## What the WASI host actually does

`wasmtime serve` is the easiest WASI HTTP host. It:

1. Opens a TCP socket and speaks HTTP/1.1 + HTTP/2.
2. For each request, instantiates your component, calls `wasi:http/incoming-handler.handle(request, response-outparam)`.
3. Streams the body back over the socket.

Your component does **none** of the socket / parsing / TLS work. YASWS's `YASWSWasiHTTP` adapter takes the WASI `incoming-request` resource, converts it to a `YasswsRequest`, runs your handler, and writes the result back through the `response-outparam` — that's the whole transport.

For production you'd swap `wasmtime serve` for an embedded host (e.g. Rust + the `wasmtime-wasi-http` crate, or a JS host via `jco transpile`). The component is the same in either case.

## Troubleshooting

- **`jco: command not found`** — run `npx jco …` instead of `jco …`, or check `node_modules/.bin/` is on PATH.
- **`componentize-js: SpiderMonkey panicked`** — usually means your bundle still has a `require(…)` or unresolved import. Run `esbuild` with `--format=esm` and `--external:wasi:*`.
- **`wasmtime serve` 500s on every request** — run with `WASMTIME_LOG=trace wasmtime serve …` to see the guest stderr. JS exceptions inside the component land there.
- **WIT version mismatch** — wasmtime serve currently ships `wasi:http@0.2.x`. Make sure your `wit/world.wit` and the `wasi:http/types@0.2.8` import string in code match wasmtime's version. `wasmtime --version` against the [release notes](https://github.com/bytecodealliance/wasmtime/releases) tells you which.
