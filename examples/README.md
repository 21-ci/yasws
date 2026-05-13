# YASWS Examples

Four runnable examples showing YASWS v2. **Every example ships both transports** (`node:http` and `wasi:http`) — pick one with `npm run start:node` or `npm run serve:wasi`.

| Example                                  | What it shows |
|------------------------------------------| --- |
| [`01-hello-wasi`](01-hello-world)        | WASI-focused walkthrough: WIT world, esbuild + jco pipeline, host architecture. Node entry included for fast iteration. |
| [`02-portable-rest`](02-portable-rest)   | CRUD REST API showcasing param decorators, OpenAPI, health, lifecycle hooks. One `buildApp()`, two entrypoints. |
| [`03-sql-snippets`](03-sql-snippets) | **Multi-file, folder-distributed layout** with real SQL persistence via libsql/Turso (HTTP). Same code on Node and WASI. Filters, middlewares, exception filters, per-route CSP, OpenAPI, health. |

## Prerequisites

### For all examples (Node transport)

- **Node 22+** (ESM with NodeNext resolution, native `fetch`)
- `npm`

### For the WASI transport

- **wasmtime ≥ 22** — host runtime:
  ```sh
  curl https://wasmtime.dev/install.sh -sSf | bash
  # or: brew install wasmtime
  ```
  Verify: `wasmtime --version` and `wasmtime serve --help`.
- **jco + componentize-js** — JS-to-component compiler. Pulled in as devDeps by each example (`npm install`).
- **esbuild** — bundles the entry into a single ESM file with `wasi:*` imports left as bare specifiers. Required because componentize-js cannot resolve npm imports itself.

## YASWS dependency resolution

While developing in this repo, examples reference YASWS via a local path:

```jsonc
"dependencies": {
  "yasws": "file:../.."
}
```

Once YASWS ships to npm, swap this for `"yasws": "^2.0.0"`. (Example 03 already uses the published version.)

## Common npm scripts

Every example uses the same script names:

| Script | What it does                                                          |
|---|-----------------------------------------------------------------------|
| `npm run build:node` | `tsc` only — produces `dist/node.js`                                  |
| `npm run build:wasi` | `tsc → esbuild bundle → jco componentize` — produces `build/app.wasm` |
| `npm run build` | Alias for `build:wasi` (builds everything)                            |
| `npm run start:node` | Runs the Node entry on port 8000 (or 8080 for example 01)             |
| `npm run serve:wasi` | `wasmtime serve build/app.wasm`                                       |
| `npm run clean` | Removes `dist/` and `build/`                                          |

## Workflow at a glance

### Node

```
src/app.ts ┐
src/node.ts ─tsc─▶ dist/node.js ─node─▶ HTTP server (node:http)
```

### WASI

```
src/app.ts ┐
src/wasi.ts ─tsc─▶ dist/wasi.js ─esbuild─▶ build/bundle.js ─jco─▶ build/app.wasm ─wasmtime serve─▶ HTTP server (wasi:http)
```

Both entries import the **same** `buildApp()` from `app.ts`.

## What the WASI host actually does

`wasmtime serve` is the easiest WASI HTTP host. It:

1. Opens a TCP socket and speaks HTTP/1.1 + HTTP/2.
2. For each request, instantiates your component, calls `wasi:http/incoming-handler.handle(request, response-outparam)`.
3. Streams the body back over the socket.

Your component does **none** of the socket / parsing / TLS work. YASWS's `yasswsWasiHttpHandle` adapter takes the WASI `incoming-request` resource, converts it to a `YasswsRequest`, runs your handler, and writes the result back through the `response-outparam` — that's the whole transport.

For production you'd swap `wasmtime serve` for an embedded host (Rust + the `wasmtime-wasi-http` crate, or a JS host via `jco transpile`). The component is the same in either case.

## Authoring rule of thumb

Keep `app.ts` (the composition root) **pure**: no `process.env`, no `node:*` imports, no SIGINT handlers. Put all env-driven config and signal wiring in `node.ts`. That way the same `buildApp()` compiles to WASI without dragging Node-only shims into the wasm.

Example 03 follows this rule strictly — its `infra/config.ts` is imported only from `node.ts`.

## Troubleshooting

- **`jco: command not found`** — use `npx jco …` or make sure `node_modules/.bin/` is on PATH.
- **`componentize-js: SpiderMonkey panicked`** — usually means your bundle still has a `require(…)` or unresolved import. Confirm `esbuild` was run with `--format=esm --external:wasi:*`.
- **`wasmtime serve` 500s on every request** — run with `WASMTIME_LOG=trace wasmtime serve …` to see the guest stderr. JS exceptions inside the component land there.
- **WIT version mismatch** — wasmtime serve ships specific `wasi:http@0.2.x` minors. Make sure `wit/world.wit` and the `wasi:http/types@0.2.10` import string in `wasi.ts` match your wasmtime release. `cargo install wasmtime-cli --force` to upgrade.
