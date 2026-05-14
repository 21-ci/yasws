
# Introductory guide to YASWS

---

## Features

- **Transport-agnostic core** — write once, deploy to Node or `wasmtime serve`
- **Decorator routing** — `@Controller`, `@Get`, `@Post`, `@Patch`, `@Delete`, `@All`, …
- **Parameter decorators** — `@Body`, `@Query`, `@Param`, `@Headers`, `@Req`
- **Response shaping** — `@HttpCode`, `@SetHeader`, `@Redirect`
- **Schema-validated bodies** — anything with a `.parse(input)` method works (Zod, Valibot, hand-rolled)
- **Per-handler exception filters** — `@UseExceptionFilters(filter1, filter2)`
- **Nested routers** — mount controllers under arbitrary path prefixes
- **Middlewares & response interceptors** — global, per-router, per-handler
- **Lifecycle hooks** — `app.onStart(...)`, `app.onShutdown(...)`
- **OpenAPI 3.1 generation** — `openApi(app, { info })` adds `/openapi.json` + a Stoplight Elements `/docs` page
- **Security headers built in** — `secureHeaders()`, `cors()`, `rateLimit()`
- **Health probes** — `healthRouter({ liveness, readiness, checks })`
- **WASI Preview 2 HTTP** — runs as a WebAssembly Component (`wasi:http/incoming-handler@0.2`)
- **Zero `node:*` imports in the core** — `node:fs/promises` is lazy-loaded, `node:buffer` is gone (Uint8Array everywhere)
- **`sideEffects: false`** — tree-shakable

---

## Install

```sh
npm install yasws
```

TypeScript 5+, `experimentalDecorators: true`, ESM (`"type": "module"`), `moduleResolution: "NodeNext"`.

Minimum `tsconfig.json`:

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": false,
    "strict": true,
    "esModuleInterop": true
  }
}
```

---

## Quick start

```ts
import {
    Controller, Get, Post, Body, Param, Router,
    Dispatcher, YasswsResponse, YASWSNodeHTTP,
    secureHeaders, cors,
} from "yasws"

@Controller("/hello")
class HelloController extends Router {
    @Get("/")
    greet() {
        return YasswsResponse.json({ message: "hello, world" })
    }

    @Get("/:name")
    greetName(@Param("name") name: string) {
        return YasswsResponse.json({ message: `hello, ${name}` })
    }

    @Post("/echo")
    echo(@Body() body: unknown) {
        return YasswsResponse.json({ youSent: body })
    }
}

const app = new Dispatcher({ name: "demo" })
app.addRouter(new HelloController())
app.addMiddleware(cors({ origin: "*" }))
app.addResponseInterceptor(secureHeaders())

new YASWSNodeHTTP(app).listen(8000)
```

Then:

```sh
curl http://localhost:8000/hello/world
curl -X POST http://localhost:8000/hello/echo -d '{"x":1}' -H "content-type: application/json"
```

---

## OpenAPI + interactive docs

Drop in two routers and you get `GET /openapi.json` and a Stoplight Elements UI at `/docs`:

```ts
import { openApi, healthRouter, ApiTags, ApiOperation, ApiResponse } from "yasws"

@Controller("/users")
@ApiTags("users")
class UsersController extends Router {
    @Get("/:id")
    @ApiOperation({ summary: "Fetch a user by id" })
    @ApiResponse({ status: 200, jsonSchema: { type: "object" } })
    @ApiResponse({ status: 404 })
    findOne(@Param("id") id: string) { /* ... */ }
}

app.addRouter(new UsersController())
app.addRouter(healthRouter({ liveness: "/healthz", readiness: "/ready" }))
app.addRouter(openApi(app, { info: { title: "My API", version: "1.0.0" } }))
```

---

## Run as a WASI HTTP component

```ts
// src/wasi.ts
import { yasswsWasiHttpHandle } from "yasws"
import { buildApp } from "./app.js"

const app = buildApp()
export const incomingHandler = {
    handle: yasswsWasiHttpHandle(app),
}
```

Build pipeline (see `examples/02-hello-wasi`):

```sh
tsc                                                                  # compile TS
esbuild dist/wasi.js --bundle --format=esm --platform=node \
    --target=es2022 --external:wasi:* --outfile=build/bundle.js     # bundle
jco componentize build/bundle.js --wit wit/ --world-name app \
    --out build/app.wasm                                             # componentize
wasmtime serve -Scli --addr 0.0.0.0:8000 build/app.wasm              # serve
```

The same `buildApp()` factory powers Node and WASI — see `examples/03-portable-rest`.

---

## Examples

| Folder | What it shows |
|---|---|
| [`examples/01-hello-node`](examples/01-hello-node) | Smallest possible Node-only server |
| [`examples/02-hello-wasi`](examples/01-hello-world) | Same idea, compiled to a WASI HTTP component |
| [`examples/03-portable-rest`](examples/02-portable-rest) | Shared `buildApp()` running on both transports, OpenAPI + health + lifecycle |
| [`examples/04-prism-snippets`](examples/03-prism-snippets) | **Multi-file, folder-distributed routers** — code-snippet API with a Prism.js viewer page |

---

## Core concepts

### Dispatcher

The root router. Owns transport-independent state: middlewares, response interceptors, lifecycle hooks, the routing tree, the logger.

```ts
const app = new Dispatcher({ name: "my-app" })
```

### Router & `@Controller`

A controller is a class that extends `Router`. `@Controller(path)` mounts everything inside the class under `path`. Add child routers to compose the tree:

```ts
@Controller("/api")
class ApiRoot extends Router {}

const api = new ApiRoot()
api.addRouter(new UsersController())
api.addRouter(new PostsController())
app.addRouter(api)
```

### Handlers

Decorate methods with `@Get`/`@Post`/`@Patch`/`@Delete`/`@All`/`@Head`/`@Options`/`@Put`. The handler can return a `YasswsResponse` or a plain value (auto-converted via `toResponse()`).

### Parameter decorators

```ts
@Post("/:id")
update(
    @Param("id") id: string,                // path param
    @Query("force") force: string | undefined,  // ?force=1
    @Body(updateSchema) patch: UpdateInput,  // JSON body, validated
    @Headers("x-trace") trace: string | undefined,
    @Req() req: YasswsRequest,
) { ... }
```

`@Body(schema)`, `@Query(name, schema)`, `@Param(name, schema)`, `@Headers(name, schema)` accept any object with a `.parse(input)` method. If validation throws, the framework returns a `400 Bad Request` (or whatever your `@UseExceptionFilters` decides).

### Method decorators

```ts
@Post("/")
@HttpCode(201)
@SetHeader("X-Resource", "user")
@UseExceptionFilters(validationFilter)
create(@Body(createSchema) input: CreateInput) { ... }
```

### Filters & middlewares

`Filter` = boolean gate (`call(request)` returns true/false). Apply with `@UseFilters(new MyFilter())`.

`Middleware` = mutator (`call(request)` returns a new `YasswsRequest` or `UNHANDLED`). Apply per-router with `router.addMiddleware(...)` or per-handler with `@UseMiddleware(...)`.

### Exception filters

```ts
class ProblemDetails implements ExceptionFilter {
    catch(err: unknown, _req: YasswsRequest) {
        if (err instanceof MyAppError) {
            return YasswsResponse.json({ type: err.type, detail: err.message }, err.status)
        }
        return undefined   // let the framework's default kick in
    }
}
```

### Lifecycle hooks

```ts
app.onStart(async () => { /* open DB, warm caches */ })
app.onShutdown(async () => { /* close DB */ })
```

Node transport calls them automatically on `listen()` / `close()`. WASI lazy-starts on the first request.

---

## Sample project layout

You don't have to keep everything in one file. The recommended layout for medium projects:

```
src/
├── index.ts                  ─ entry: build app, start transport
├── app.ts                    ─ buildApp() — composes routers, middlewares, hooks
├── modules/
│   ├── users/
│   │   ├── users.controller.ts
│   │   ├── users.schemas.ts
│   │   └── users.store.ts
│   └── posts/
│       ├── posts.controller.ts
│       └── posts.store.ts
├── shared/
│   ├── auth.filter.ts
│   ├── problem.filter.ts     ─ ExceptionFilter
│   └── trace.middleware.ts
└── infra/
    ├── boot.ts               ─ wires health + openApi routers
    └── config.ts
```

See `examples/04-prism-snippets` for a working version of this layout.

---

## Security

The `secureHeaders()` interceptor sets sensible defaults (CSP, HSTS, X-Frame-Options, Referrer-Policy, COOP, CORP, …). It uses `set-if-absent` semantics, so per-route overrides compose correctly.

```ts
app.addResponseInterceptor(secureHeaders())   // global defaults
app.addResponseInterceptor(cors({ origin: ["https://app.example.com"] }))

// Per-route override:
@Get("/widget")
widget() {
    const res = YasswsResponse.html(html)
    res.setHeader("Content-Security-Policy", "default-src 'self' https://cdn.example.com")
    return res
}
```

`rateLimit(...)` is also available as a middleware.
