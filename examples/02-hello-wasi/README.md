# 02 — Hello, WASI HTTP

The same handler as `01-hello-node`, but compiled to a WebAssembly Component and served by `wasmtime serve` over the `wasi:http/incoming-handler@0.2.8` interface.

## Prerequisites

You need `wasmtime` on your `PATH`:

```sh
curl https://wasmtime.dev/install.sh -sSf | bash
wasmtime --version            # check, should be ≥ 22.0
wasmtime serve --help         # confirm the `serve` subcommand exists
```

Everything else (`jco`, `componentize-js`, `esbuild`, `typescript`) is a devDep — `npm install` pulls them in.

## Files

```
.
├── package.json               # build/serve scripts
├── tsconfig.json              # NodeNext + decorators
├── wit/world.wit              # `include wasi:http/proxy@0.2.8`
└── src/index.ts               # handler + WASI export
```

`src/index.ts` does three things:

1. Imports `wasi:http/types@0.2.8` (host-resolved at link time).
2. Builds a `Dispatcher` exactly like the node example.
3. Exports `incomingHandler` — that name is what the WIT world expects.

## Build

```sh
npm install
npm run build
```

The `build` script runs three steps in order:

| Step | Tool | Why |
| --- | --- | --- |
| `build:ts` | `tsc` | Compiles `src/*.ts` → `dist/*.js`. |
| `build:bundle` | `esbuild` | Bundles `dist/index.js` (and its `yasws` import) into a **single ESM file** with `wasi:*` left as bare imports. componentize-js cannot resolve npm imports itself. |
| `build:wasm` | `jco componentize` | Runs componentize-js (SpiderMonkey + the JS in a Wizer snapshot) against the bundle, producing `build/app.wasm` — a real WASI HTTP component. |

Output: `build/app.wasm` (typically 6–10 MB; that's the SpiderMonkey snapshot baked in).

## Run

```sh
npm run serve
```

Internally:

```sh
wasmtime serve -Scli --addr 0.0.0.0:8080 build/app.wasm
```

The `-Scli` flag is the wasmtime "CLI inherit" preset — it lets the guest log to your terminal's stderr (useful for `console.log` debugging from inside the WASM). Drop it in production.

Test it:

```sh
curl http://localhost:8080/
curl http://localhost:8080/hi/world
curl -X POST http://localhost:8080/echo \
     -H 'content-type: application/json' \
     -d '{"a":1,"b":[2,3]}'
```

## How it actually works at runtime

```
                           ┌──────────────────────┐
 HTTP/1.1 request  ───────▶│  wasmtime serve      │ (Rust host, uses wasmtime-wasi-http)
                           │  - parses HTTP       │
                           │  - opens socket      │
                           └──────────┬───────────┘
                                      │ instantiates the component;
                                      │ calls incoming-handler.handle(req, out)
                                      ▼
                           ┌──────────────────────┐
                           │  build/app.wasm      │
                           │  ┌────────────────┐  │
                           │  │ SpiderMonkey   │  │ ← componentize-js puts an engine
                           │  │   + your JS    │  │   inside the component
                           │  └────────────────┘  │
                           │       │              │
                           │       ▼              │
                           │  yasswsWasiHttpHandle │ ← converts WASI req → YasswsRequest
                           │       │              │
                           │       ▼              │
                           │  HelloController     │
                           │       │              │
                           │       ▼              │
                           │  writes back to      │
                           │  response-outparam   │
                           └──────────┬───────────┘
                                      │
 HTTP response   ◀───────── wasmtime flushes ─────┘
```

Your handler never touches a socket, never calls `node:http`, never sees raw bytes off the wire — the host owns all of that.

## Alternate hosts

`wasmtime serve` is convenient for local dev, but the **same `app.wasm`** runs unchanged under any WASI HTTP host:

- **Rust embedding** — link `wasmtime-wasi-http` into your own Rust binary. Useful if you want to terminate TLS, do auth, or route between multiple components yourself.
- **JS host via `jco transpile`** — `npx jco transpile build/app.wasm -o jsout/` produces JS bindings you can call from Node. Mostly useful for testing.
- **Cloud platforms** — anything that supports `wasi:http/proxy` (Fermyon Spin, wasmCloud, Cosmonic, etc.) can run this binary directly.

## Things that go wrong, and fixes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `jco: failed to resolve "yasws"` during componentize | You skipped the esbuild step. componentize-js can't resolve npm packages. | Run `npm run build` (which runs esbuild first), not `jco componentize` directly. |
| `Error: failed to find package wasi:http` | Your wasmtime / jco have mismatched WASI HTTP versions. | Update both: `cargo install wasmtime-cli --force` + `npm i -D @bytecodealliance/jco@latest`. |
| 500 on every request, no body | JS exception inside the component. | Run with `WASMTIME_LOG=trace wasmtime serve …` — the guest's `console.error` lands in trace output. |
| Build takes 30+ seconds | Normal. componentize-js bakes a SpiderMonkey snapshot every time. Use `npm run build:wasm` alone if only the JS changed. | — |
