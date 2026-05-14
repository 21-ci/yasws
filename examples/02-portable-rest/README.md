# 03 — Portable REST API

A CRUD service for a `User` resource. **One handler file** (`src/app.ts`) is consumed by two thin entrypoints — one for `node:http`, one for WASI. Pick the transport at deploy time, not in code.

## Why this layout

```
src/
├── app.ts      ← all business logic. No node:http, no wasi:http.
├── node.ts     ← imports buildApp(), wraps with YASWSNodeHTTP.
└── wasi.ts     ← imports buildApp(), exports incomingHandler.
```

`buildApp()` returns a fully-wired `Dispatcher`. Both entrypoints just hand it to their transport. The same controllers, validators, middleware, and interceptors run unchanged.

## What's in the API

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| `GET` | `/` | — | service info |
| `GET` | `/health` | — | `{status: "ok"}` |
| `GET` | `/users` | — | list of users |
| `GET` | `/users/:id` | — | one user, 404 if missing |
| `POST` | `/users` | `{name, email}` | created user, 201 |
| `PATCH` | `/users/:id` | `{name?, email?}` | updated user |
| `DELETE` | `/users/:id` | — | 204 |

Each request goes through:

1. **CORS** (preflight + response headers) — `cors({ origin: "*" })`
2. **secureHeaders** (Helmet equivalent: CSP, X-Frame-Options, HSTS-when-https, …)
3. The controller method
4. Errors → typed `HttpError` subclasses → JSON 4xx/5xx

## Install

```sh
npm install
```

For the WASI build you'll also need `wasmtime` on your `PATH` — see [`../README.md`](../README.md).

## Run on Node

```sh
npm run build:node
npm run start:node
```

```sh
curl http://localhost:8000/
curl http://localhost:8000/users                                    # []
curl -X POST http://localhost:8000/users \
     -H 'content-type: application/json' \
     -d '{"name":"Ada","email":"ada@example.com"}'                  # 201
curl http://localhost:8000/users/1                                  # the new user
curl -X PATCH http://localhost:8000/users/1 \
     -H 'content-type: application/json' \
     -d '{"name":"Ada Lovelace"}'
curl -X DELETE http://localhost:8000/users/1                        # 204
```

## Run on WASI

First of all, install `wkg` with `cargo`

```sh
cargo install wkg
```

Afterward, install all dependencies with `wkg`

```sh
wkg wit fetch
```

Then you can run the build sequence

```sh
npm run build:wasi
npm run serve:wasi
```

Same `curl` commands work, just hit port `8080`:

```sh
curl http://localhost:8080/users
# …
```

## Differences worth knowing

| | Node | WASI |
| --- | --- | --- |
| State persistence | Lives in process. `UserStore` survives across requests. | **Also** lives in process — `wasmtime serve` reuses one instance across requests by default. If you scale horizontally each replica has its own store. Use a DB. |
| Background timers | Work (Node event loop). | The WASI 0.2 proxy world is request-scoped — no `setInterval` between requests. Don't try. |
| Filesystem | Works if you give it permissions. | Only with explicit `wasmtime serve --dir …` preopens. Templater needs this. |
| Process signals | SIGINT/SIGTERM → graceful drain. | Host's problem. |
| Outbound HTTP | `fetch`, `node:http`. | `wasi:http/outgoing-handler` (the `proxy` world includes this). |

## Suggested production setup

- Build `app.wasm` in CI.
- Deploy to a host that supports `wasi:http/proxy@0.2.x`:
  - [Fermyon Spin](https://www.fermyon.com/spin) — `spin up app.wasm`
  - [wasmCloud](https://wasmcloud.com) — wadm manifest pointing at the registry
  - your own Rust host using the `wasmtime-wasi-http` crate, with TLS termination and auth ahead of it
- Replace the in-memory `UserStore` with a real store. Inside the WASM, that's `wasi:keyvalue` or an outbound HTTP DB driver — both work the same way as `wasi:http/types`: import at link time, host provides.
