# Changelog

All notable changes to YASWS are documented here. 

## 2.0.0 — 2026-05-14

A from-scratch rewrite. v1.x users will need to migrate every controller — there is no compatibility shim. See `MIGRATION.md` for the line-by-line guide.

### TL;DR
- Async everywhere (v1 was sync / thread-blocking).
- Transport-agnostic core. Same handler runs on `node:http` *and* as a WASI HTTP component (`wasmtime serve`).
- NestJS-style decorator surface (`@Controller`, `@Get`, `@Body`, `@HttpCode`, …) instead of one-size `@Route`.
- Zero `node:*` imports in the hot path; `node:fs/promises` is lazy.
- `Buffer` → `Uint8Array` everywhere — works in componentize-js.

---

### Added

**Transports**
- `YASWSNodeHTTP` — `node:http` listener with body-size limits, server timeouts, graceful shutdown (drain), optional TLS, Host-header allow-list.
- `YASWSWasiHTTP` + `yasswsWasiHttpHandle` — `wasi:http/incoming-handler@0.2.10` adapter for componentize-js.

**Routing decorators**
- `@Controller(path)` — class-level path prefix; auto-extends `Router`.
- HTTP-method decorators: `@Get`, `@Post`, `@Put`, `@Patch`, `@Delete`, `@Head`, `@Options`, `@All`.
- `@UseFilters(...filters)`, `@UseMiddleware(...mw)` for per-handler composition.

**Parameter decorators** (no `reflect-metadata` — purely structural)
- `@Body(schema?)`, `@Query(name?, schema?)`, `@Param(name?, schema?)`, `@Headers(name?, schema?)`, `@Req()`.
- `schema` is any object with a `.parse(input)` method — Zod, Valibot, hand-rolled all work. Validation throws → framework returns 400 (or whatever your exception filter decides).

**Method-response decorators**
- `@HttpCode(code)`, `@SetHeader(name, value)`, `@Redirect(location, code?)`.

**Exception handling**
- `ExceptionFilter` interface with `catch(err, req)`.
- `@UseExceptionFilters(...filters)` to scope filters to a handler.
- Built-in `HttpError` hierarchy: `BadRequestError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `MethodNotAllowedError`, `PayloadTooLargeError`, `UnsupportedMediaTypeError`, `InternalServerError`.

**Lifecycle**
- `dispatcher.onStart(hook)` / `onShutdown(hook)`.
- `dispatcher.start()` / `shutdown()` (Node transport calls them on `listen()` / `close()`; WASI lazy-starts on first request).

**OpenAPI 3.1**
- `buildOpenApiSpec(rootRouter, opts)` — walks the route tree, emits a spec.
- `openApi(rootRouter, opts)` — returns a router that serves `/openapi.json` and a `/docs` page (Stoplight Elements, CDN-loaded).
- Documentation decorators: `@ApiTags`, `@ApiOperation`, `@ApiResponse`, `@ApiBody`, `@ApiQuery`, `@ApiParam`, `@ApiHeader`, `@ApiBearerAuth`, `@ApiDeprecated`. `@ApiTags` and `@ApiBearerAuth` work as both class and method decorators.

**Health probes**
- `healthRouter({ liveness, readiness, checks, timeoutMs })` — `/healthz` (always 200) + `/ready` (runs each check with a per-check timeout, returns 503 on failure).

**Security**
- `secureHeaders(opts?)` — Helmet-equivalent response interceptor (CSP, HSTS, X-Frame-Options, Referrer-Policy, COOP, CORP, …). Uses set-if-absent semantics so per-route overrides compose.
- `cors(opts)` — request middleware + response interceptor pair.
- `rateLimit(opts)` — token-bucket middleware with pluggable key function.

**Request / response**
- New `YasswsRequest` wrapper with `params`, `query`, `headers`, `header(name)`, `headerAll(name)`, `json<T>()`, `text()`, `body()`, `args`, `scheme`.
- New `YasswsResponse` class with static helpers `.json(body, code?, headers?)`, `.html(body, …)`, `.text(body, …)`, `.buffer(bytes, contentType, …)`, `.empty(code?)`; `setHeader()` returns `this` for chaining.

**Routing tree**
- `router.addRouter(child)` keeps full-path bookkeeping in sync (no manual prefix wiring).
- `router.walkRoutes()` iterator — used by the OpenAPI generator; available for any spec-style traversal you want to write.

**Logger**
- New `Logger` class with `LogLevel`, `LogMode`, file-logger support, plus `LoggerMiddleware` for per-request access logs.
- `defaultLogger` exported as a sensible default.

**Examples**
- `examples/01-hello-node` — minimum example, both transports.
- `examples/02-hello-wasi` — WASI-focused walkthrough.
- `examples/03-sql-snippets` — multi-file, folder-distributed app backed by libsql/Turso over HTTP (works in both transports without native bindings).

### Changed (breaking)

- **Sync → async.** Every handler is now `async`. Returning a value still works; the dispatcher awaits it.
- **`@Route(path, method, filters)` → `@<Method>(path)`** (`@Get`, `@Post`, …). Filters move to `@UseFilters(...filters)`.
- **Handler return type.** v1 returned `HandlerResponse` plain objects (`{ statusCode, contentType, data }`). v2 handlers return `YasswsResponse` (or anything coercible via `toResponse()`).
- **Request type.** v1 received `http.IncomingMessage`. v2 receives `YasswsRequest` (transport-neutral).
- **Filter signature.** `call(request)` now receives a `YasswsRequest` (not `http.IncomingMessage`). Synchronous or async, both supported.
- **Middleware signature.** `call(request)` returns the (possibly mutated) `YasswsRequest`, *or* the `UNHANDLED` sentinel to short-circuit the pipeline.
- **Custom not-found handling.** `Dispatcher.handleUnhandled(req, res)` is gone. Override `onNotFound` / `onError` hooks on the dispatcher, or attach an `ExceptionFilter`.
- **Bootstrapping.** `dispatcher.run()` is gone. Pick a transport: `new YASWSNodeHTTP(app).listen()` for Node, `yasswsWasiHttpHandle` for WASI.
- **Path normalization fix.** Routers without an explicit `rootPath` no longer get an unwanted `/` prefix. Empty path stays empty.
- **`Header` decorator consolidated into `@Headers`.** v1 had both; only `@Headers(name?)` survives.
- **Buffer → Uint8Array.** Response `data`, request body reader, `inject()` helper, everything. If you were passing `Buffer`, it still works in Node (Buffer extends Uint8Array) but the type is now `Uint8Array`.

### Removed

- **`Templater` and EJS templates.** Couldn't work in componentize-js (`node:fs` unavailable). Render HTML yourself or use a string-template library that runs in any JS runtime. `ejs` / `@types/ejs` are no longer dependencies.
- **`safeJoinPath` helper.** Only used by the templater.
- **Sync filter/middleware contracts.** v1 filters returned `boolean` sync; v2 supports `boolean | Promise<boolean>`.
- **Top-level export `Header` decorator** (renamed to `Headers`).

### Fixed

- **`/docs` (Stoplight) blocked by global CSP.** `secureHeaders()` now uses set-if-absent semantics so the `/docs` handler's per-route CSP override (permitting unpkg/cdnjs) is preserved.
- **Routers added without a `rootPath` mounted as `//`.** `normalizePath("")` now early-returns `""` instead of adding a trailing slash.
- **Decorator generic constraint too narrow.** `@Controller`'s class decorator now accepts any constructor returning `object` (previously rejected classes whose constructor params weren't `unknown[]`).

### Internal

- `package.json` → `"sideEffects": false` (full tree-shaking).
- All metadata stored in a `WeakMap<descriptor.value, HandlerMetadata>` — no `reflect-metadata`, no class-level pollution.
- Controllers bind their `this` to handlers automatically via `handler.instance`.
- `node:fs/promises` import is dynamic and runtime-built (`["node:", "fs/promises"].join("")`) to escape static module resolution in bundlers.

---

### Migration sketch

```ts
// v1
class HelloRouter extends Router {
  @Route("/", "GET", [new SomeFilter(true)])
  hi(req: http.IncomingMessage): HandlerResponse {
    return { statusCode: 200, contentType: "text/plain", data: "ok" }
  }
}
new SomeDispatcher().addRouter(new HelloRouter("hello/")).run()
```

```ts
// v2
@Controller("/hello")
class HelloController extends Router {
  @Get("/")
  @UseFilters(new SomeFilter(true))
  async hi() {
    return YasswsResponse.text("ok")
  }
}
const app = new Dispatcher()
app.addRouter(new HelloController())
await new YASWSNodeHTTP(app, { port: 8000 }).listen()
```

See `MIGRATION.md` for the full mapping.

---

## 1.1.5 — earlier

Last release of the sync, Node-only v1 line. See git history at tag `v1.0.4` for the README of that era. v1.x is no longer maintained.
