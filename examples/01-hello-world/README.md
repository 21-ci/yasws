# 01 — Hello World, WASI HTTP (+ Node)

WASI-focused example: the handler is compiled to a WebAssembly Component and served by `wasmtime serve` over the `wasi:http/incoming-handler@0.2.10` interface. The same `buildApp()` is also exposed via `node:http` for quick iteration without rebuilding the wasm.

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
├── wit/world.wit              # `include wasi:http/proxy@0.2.10`
└── src/
    ├── app.ts                 # buildApp() — Dispatcher + HelloController
    ├── node.ts                # Node entry (YASWSNodeHTTP)
    └── wasi.ts                # WASI entry — exports incomingHandler.handle
```

`src/wasi.ts` does three things:

1. Imports `wasi:http/types@0.2.10` (host-resolved at link time).
2. Calls `buildApp()` — the same dispatcher used by `node.ts`.
3. Exports `incomingHandler` — that name is what the WIT world expects.

## Install

```sh
npm install
```

If your `wasmtime` version doesn't ship the `wasi:http` WIT package, fetch the WITs with `wkg`:

```sh
cargo install wkg          # one-time
wkg wit fetch              # populate wit/deps
```

## Run on Node (fast iteration)

```sh
npm run build:node         # tsc
npm run start:node         # node --enable-source-maps dist/node.js
```

Smoke test on `http://localhost:8080`:

```sh
curl http://localhost:8080/
curl http://localhost:8080/hi/world
curl -X POST http://localhost:8080/echo -d '{"a":1,"b":[2,3]}' -H "content-type: application/json"
```

## Run on WASI

```sh
npm run build:wasi         # tsc → esbuild → jco componentize
npm run serve:wasi         # wasmtime serve build/app.wasm
```

`build:wasi` runs three steps in order:

| Step | Tool | Why |
| --- | --- | --- |
| `build:ts` | `tsc` | Compiles `src/*.ts` → `dist/*.js`. |
| `build:bundle` | `esbuild` | Bundles `dist/wasi.js` (and its `yasws` import) into a **single ESM file** with `wasi:*` left as bare imports. componentize-js cannot resolve npm imports itself. |
| `build:wasm` | `jco componentize` | Runs componentize-js (SpiderMonkey + the JS in a Wizer snapshot) against the bundle, producing `build/app.wasm` — a real WASI HTTP component. |

Output: `build/app.wasm` (typically 6–10 MB; that's the SpiderMonkey snapshot baked in).

Internally `npm run serve:wasi` runs:

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
                           │ yasswsWasiHttpHandle │ ← converts WASI req → YasswsRequest
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
