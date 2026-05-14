# Example 03 — SQL Snippets (Node + WASI + libsql/Turso)

A non-trivial YASWS app organised as a folder-distributed, multi-file project, persisting data in **libsql** (SQLite-compatible) over HTTP. The same code runs on `node:http` and as a WASI HTTP component.

The app is a tiny snippet API plus an HTML viewer page that renders code with [Prism.js](https://prismjs.com/) — the seeded examples are SQL queries (showing off Prism's `sql` grammar), but the schema lets you store snippets in any language.

## Why HTTP-based libsql instead of embedded SQLite?

The native `better-sqlite3` and Prisma's query engine ship as **platform-specific binaries** — they can't run inside a `componentize-js` WASI component. By using `@libsql/client/web` (the HTTP transport) instead of `@libsql/client` (which picks an embedded native binding), the **same code path** runs in Node and in WASI:

- Under Node, `fetch` is V8's native implementation.
- Under WASI, `fetch` is provided by componentize-js and backed by `wasi:http/outgoing-handler@0.2.10` — wasmtime makes the actual TCP call on the component's behalf.

The trade-off: you need a libsql server reachable over HTTP. The easiest one for local dev is `turso dev`.

## What this example demonstrates

- Folder-distributed, multi-file project layout (modules, shared, infra, domain)
- Nested routers — `/api/snippets` and `/api/languages` mounted under a sub-router
- **Real SQL persistence** via `@libsql/client/web` (HTTP, no native bindings, works in both transports)
- Schema bootstrapped on `onStart`; idempotent demo-data seed
- Schema-validated request bodies via `@Body(schema)`
- Custom exception filter (`ProblemFilter`) returning RFC 7807-style 422s
- Custom `Filter` (`ApiKeyFilter`) and `Middleware` (`TraceMiddleware`)
- Per-route CSP override (so cdnjs is allowed only on HTML routes)
- OpenAPI 3.1 spec + Stoplight Elements `/docs` page
- Health probes — `/ready` actually runs `SELECT COUNT(*) FROM snippets`
- Lifecycle hooks (`onStart` runs DDL + seed; `onShutdown` logs)
- One pure composition root (`app.ts`) consumed by two transport entries (`node.ts`, `wasi.ts`)

## Layout

```
src/
├── app.ts                              ─ buildApp({ dbUrl }) — composition root (pure)
├── node.ts                             ─ Node entry — loads env config, starts YASWSNodeHTTP
├── wasi.ts                             ─ WASI entry — exports incomingHandler.handle
├── domain/
│   ├── snippet.ts                      ─ Snippet model + DTO types
│   └── snippet-store.ts                ─ SQL-backed repository (one query per method)
├── modules/
│   ├── snippets/
│   │   ├── snippets.controller.ts      ─ REST controller
│   │   └── snippets.schemas.ts         ─ runtime validators (.parse)
│   ├── languages/
│   │   ├── languages.controller.ts     ─ /api/languages
│   │   └── prism-languages.ts          ─ Prism grammar allow-list
│   └── ui/
│       ├── ui.controller.ts            ─ HTML routes ("/", "/snippets/:id")
│       └── ui.pages.ts                 ─ Prism.js viewer + per-route CSP
├── shared/
│   ├── problem.filter.ts               ─ ExceptionFilter → 422 problem+json
│   ├── api-key.filter.ts               ─ Filter — x-api-key gate
│   └── trace.middleware.ts             ─ Middleware — request-id propagation
└── infra/
    ├── config.ts                       ─ env-driven AppConfig (+ wasiDefaults for WASI)
    ├── db.ts                           ─ libsql client factory + schema bootstrap
    └── seed.ts                         ─ idempotent demo snippet seeder
wit/
└── world.wit                           ─ "include wasi:http/proxy@0.2.10" (includes outgoing-handler)
```

## Prerequisites

| Transport | Install |
|---|---|
| Node | Node 22+ |
| WASI | Node 22+, [`wasmtime`](https://wasmtime.dev) (`brew install wasmtime` on macOS) |
| libsql server | [Turso CLI](https://docs.turso.tech/cli/installation) (`brew install tursodatabase/tap/turso`) |

## Install

```sh
npm install
```

## Step 1 — start the database

In one terminal, run a local libsql server. The Turso CLI ships an embedded one:

```sh
npm run dev:db
# alias for:  turso dev --port 8081
```

This creates an in-memory SQLite database listening on `http://localhost:8081`. Add `--db-file ./snippets.db` to persist to disk:

```sh
turso dev --port 8081 --db-file ./snippets.db
```

> Don't have the Turso CLI? Any libsql-compatible HTTP server works (`libsql-server` Docker image, Turso cloud, etc.). Point `DB_URL` at it.

## Step 2 — run the app

### On Node

```sh
npm run build:node
DB_URL=http://localhost:8081 npm run start:node
```

Without setting `DB_URL` it defaults to `http://localhost:8081`, so for the standard `turso dev` setup the env var is optional.

Then open:

- `http://localhost:8000/`              — the Prism-rendered snippet list
- `http://localhost:8000/snippets/1`    — single-snippet view
- `http://localhost:8000/api/snippets`  — JSON API
- `http://localhost:8000/api/snippets?language=sql`
- `http://localhost:8000/docs`          — Stoplight Elements UI
- `http://localhost:8000/openapi.json`  — generated OpenAPI 3.1 spec
- `http://localhost:8000/healthz`       — liveness probe
- `http://localhost:8000/ready`         — readiness probe (runs `SELECT COUNT(*)`)

### On WASI

```sh
npm run build:wasi
npm run serve:wasi
# wasmtime serve -Scli -Shttp --addr 0.0.0.0:8000 build/app.wasm
```

`-Shttp` is **required** — it permits the component to make outbound HTTP calls (to libsql). Without it the component traps on the first DB call with "wasi:http/outgoing-handler not available."

The WASI build's DB URL is baked in to `http://localhost:8081` (see `src/wasi.ts` → `wasiDefaults`). To point it elsewhere, edit `src/infra/config.ts` and rebuild.

### Try the API

```sh
# list
curl http://localhost:8000/api/snippets | jq

# filter
curl 'http://localhost:8000/api/snippets?language=sql' | jq

# create
curl -X POST http://localhost:8000/api/snippets \
  -H "content-type: application/json" \
  -d '{
    "title": "Find duplicate emails",
    "language": "sql",
    "code": "SELECT email, COUNT(*) FROM users GROUP BY email HAVING COUNT(*) > 1;"
  }' | jq

# patch
curl -X PATCH http://localhost:8000/api/snippets/1 \
  -H "content-type: application/json" \
  -d '{"title":"Top 10 hottest queries"}' | jq

# delete
curl -X DELETE http://localhost:8000/api/snippets/1 -i
```

Validation failures return 422 with a problem-details body:

```sh
curl -X POST http://localhost:8000/api/snippets \
  -H "content-type: application/json" \
  -d '{"title":"","language":"klingon","code":""}'
# → HTTP/1.1 422
# → {"type":"about:blank","title":"Unprocessable Entity","status":422,"detail":"title must be 1..200 chars"}
```

## Configuration (env vars, Node only)

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `8000` | HTTP listen port |
| `HOST` | `0.0.0.0` | HTTP bind host |
| `DB_URL` | `http://localhost:8081` | libsql server URL (Turso cloud: `libsql://*.turso.io`) |
| `DB_AUTH_TOKEN` | — | Required for Turso cloud; not needed for `turso dev` |
| `API_KEY` | `dev-secret` | Used by `ApiKeyFilter` (not wired into a route by default) |
| `BODY_LIMIT_BYTES` | `2097152` | 2 MiB cap on request bodies |

Under WASI the host decides the listen address (`wasmtime serve --addr ...`); the rest uses defaults from `src/infra/config.ts`.

## Pointing at Turso cloud

If you have a Turso account:

```sh
turso db create yasws-snippets
turso db tokens create yasws-snippets
turso db show --url yasws-snippets

DB_URL='libsql://yasws-snippets-<your-org>.turso.io' \
DB_AUTH_TOKEN='<the token>' \
  npm run start:node
```

For WASI, edit `src/infra/config.ts` → `wasiDefaults.dbUrl` (and add `dbAuthToken`), then rebuild. In a real deployment you'd import `wasi:cli/environment` in `wit/world.wit` and read the token at runtime.

## Notes

- The store is **fully async** — every method returns a `Promise`. Controllers `await` everything.
- The composition root (`app.ts`) is pure: no `process.env`, no `node:*` imports. All env-driven config is loaded in `node.ts` only. This is what lets the same `buildApp()` compile to WASI cleanly.
- The schema is bootstrapped in `onStart`. On WASI this fires lazily on the first request, so the very first request pays the DDL cost — subsequent ones find the table already there.
- The UI controller overrides CSP per-route so cdnjs is allowed only on HTML pages; `secureHeaders()` uses `set-if-absent` so the override survives the global interceptor.
- Demo seed is idempotent (`if (await store.count() > 0) return`).
- `wasmtime serve -Shttp` permits *all* outbound HTTP. In production prefer the Rust embedding API which lets you restrict outbound destinations per-component.
