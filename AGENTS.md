# YASWS — Guide for AI Agents

This document is for LLM agents writing code on top of YASWS or generating YASWS apps for users. Humans can read it too. Everything here is current as of v2.0.0-alpha.

## What YASWS is

A TypeScript web framework with a **transport-agnostic core**. You write the same controller / handler code regardless of whether it eventually runs on `node:http`, on WASI HTTP via wasmtime, or in tests via in-process injection.

The architecture splits into three layers:

```
                                                              ┌──────────────────────┐
                                                       ┌──────►   YASWSNodeHTTP      │  node:http listener
                                                       │      │   port, TLS, limits  │
                                                       │      └──────────────────────┘
┌─────────────┐    ┌──────────────────┐                │      ┌──────────────────────┐
│ Controller  │    │ Dispatcher       │                ├──────►   YASWSWasiHTTP      │  wasi:http/incoming-handler
│ (Router     ├───►│  dispatch(req) ──┼─► AppHandler ──┤      │   (Wasmtime, jco)    │
│  subclass)  │    │  toHandler()     │                │      └──────────────────────┘
└─────────────┘    └──────────────────┘                │      ┌──────────────────────┐
                                                       └──────►  dispatcher.inject() │  in-process (tests)
                                                              └──────────────────────┘
```

`AppHandler = (req: YasswsRequest) => Promise<YasswsResponse>`. That is the contract a transport binds against. Everything else hangs off it.

## The 5 things you need to know

1. **Write controllers as `Router` subclasses with decorators.**
2. **Return `YasswsResponse` (or a `YasswsResponse.json(...)` / `.html(...)` / `.redirect(...)`).**
3. **Read input via `request.params`, `request.query`, `await request.json()`, `await request.text()`, `await request.form()`.**
4. **Throw `HttpError` (or its subclasses) — the dispatcher renders them correctly.**
5. **Compose the app with `Dispatcher` + transports. Don't import `node:http` in handlers.**

## Minimal working app (node:http)

```ts
import {
  Controller, Router, Get, Post,
  Dispatcher, YasswsResponse, YASWSNodeHTTP, secureHeaders,
  BadRequestError,
} from "yasws"
import type { YasswsRequest } from "yasws"

@Controller("/users")
class UserController extends Router {
  @Get("/:id")
  async getUser(req: YasswsRequest) {
    if (!/^\d+$/.test(req.params.id!)) throw new BadRequestError("id must be numeric")
    return YasswsResponse.json({ id: req.params.id, name: "Ada" })
  }

  @Post("/")
  async create(req: YasswsRequest) {
    const body = await req.json<{ name: string }>({ maxBytes: 4096 })
    return YasswsResponse.json({ created: body.name }, 201)
  }
}

const app = new Dispatcher()
app.addRouter(new UserController())
app.addResponseInterceptor(secureHeaders())

const server = new YASWSNodeHTTP(app, {
  port: 8000,
  limits: { maxBodyBytes: 1_000_000, requestTimeoutMs: 30_000 },
})
await server.listen()
```

## Minimal WASI component entrypoint

```ts
// Compile with: jco componentize app.ts --wit wit/world.wit -n handler -o app.wasm
import * as wasiHttpTypes from "wasi:http/types@0.2.8"
import { Dispatcher, yasswsWasiHttpHandle } from "yasws"
import { UserController } from "./controllers.js"

const app = new Dispatcher()
app.addRouter(new UserController())
const handler = app.toHandler()

export const incomingHandler = {
  async handle(request: any, responseOut: any) {
    await yasswsWasiHttpHandle(handler, request, responseOut, wasiHttpTypes as any)
  },
}
```

The WIT world should declare `export wasi:http/incoming-handler@0.2.8;` (proxy world). The host (wasmtime serve, or a custom Rust host using `wasmtime-wasi-http`) owns the socket.

## API reference (the parts that matter)

### `class Dispatcher extends Router`

| Method | Purpose |
|---|---|
| `addRouter(router)` | Attach a child router under `dispatcher.fullPath + router.rootPath`. |
| `addMiddleware(mw)` | Run `mw.call(req)` before any handler. `call` may return `YasswsResponse` to short-circuit. |
| `addResponseInterceptor(fn)` | `(req, res) => res` — last-chance response mutation. Use for security headers, CORS, request IDs. |
| `setErrorHandler(hook)` | `(req, err) => HandlerResponse \| void`. Override default 500 / HttpError rendering. |
| `setNotFoundHandler(hook)` | `(req) => HandlerResponse \| void`. Override default 404. |
| `dispatch(req)` | The pure entry point. **Transports call this. You probably don't.** |
| `toHandler()` | Returns `(req) => Promise<YasswsResponse>` — pass to a transport. |
| `inject({ method, url, headers, body })` | Synthetic request for tests. Returns the resulting `YasswsResponse`. |

### Decorators

```ts
@Controller("/users")                // sets default rootPath
@Get("/:id")                          // and friends: @Post, @Put, @Patch, @Delete, @Options, @Head, @All
@UseFilters(filter1, filter2)         // attach filters to one handler
@UseMiddleware(mw1, mw2)              // attach middleware to one handler
@Route("/path", "GET", [filter])      // v1-compatible, also accepts { filters, middlewares }
```

Decorator order: outer wraps inner. `@Get` should be on the outside.

```ts
@Get("/:id")
@UseFilters(authFilter)
async findOne() {}
```

### `class YasswsRequest`

```ts
request.method                         // "GET", "POST", ...
request.url                            // "/users/42?expand=true"
request.path                           // "/users/42/"  (always trailing slash)
request.host                           // "api.example.com"
request.scheme                         // "http" | "https"
request.remoteAddress                  // socket IP if available
request.header(name)                   // case-insensitive single value
request.headerAll(name)                // case-insensitive array
request.contentType                    // "application/json" (no params)
request.contentLength                  // number | undefined
request.query                          // URLSearchParams
request.params                         // { id: "42" } from /:id
request.args                           // free-form per-request store for middleware
request.logger                         // Logger
await request.body({ maxBytes? })      // Buffer
await request.text({ maxBytes? })      // string (utf-8)
await request.json<T>({ maxBytes? })   // T — throws BadRequestError / UnsupportedMediaTypeError / PayloadTooLargeError
await request.form({ maxBytes? })      // URLSearchParams (application/x-www-form-urlencoded)
```

`maxBytes` defaults to 1 MB. The transport enforces a hard cap on top.

### `class YasswsResponse`

```ts
new YasswsResponse({ statusCode, contentType, data, headers })
YasswsResponse.json(body, status?, headers?)
YasswsResponse.text(body, status?, headers?)
YasswsResponse.html(body, status?, headers?)
YasswsResponse.buffer(buf, contentType, status?, headers?)
YasswsResponse.empty(status?)                 // 204 by default
YasswsResponse.redirect(location, status?)    // 302 by default; sets Location

response.setHeader(name, data)                // overwrites case-insensitively
```

### Filters

```ts
class AuthFilter implements Filter {
  async call(request: YasswsRequest): Promise<boolean> {
    return Boolean(request.header("authorization"))
  }
}
```

A handler's filters all must pass. **Filters may be async.** Returning false skips that handler — the dispatcher continues with subrouters, then 404. To reject with a specific status, throw `new UnauthorizedError()` instead.

### Middlewares

```ts
class RequestId implements Middleware {
  call(req: YasswsRequest) {
    req.args.requestId = crypto.randomUUID()
  }
  postRoute(req: YasswsRequest) {
    // runs after handler match, before handler executes
  }
}
```

Return semantics for `call` / `postRoute`:

| Return | Effect |
|---|---|
| `undefined` / `void` | Continue with the unchanged request. |
| `YasswsRequest` | Continue with the returned request. |
| `YasswsResponse` | Short-circuit; this response is sent. |
| `false` / `null` | Hard-stop. No response is produced (rare; legacy escape hatch). |

### Errors

Throwing one of these from a handler returns the correct status with a JSON body:

| Class | Status |
|---|---|
| `BadRequestError` | 400 |
| `UnauthorizedError` | 401 |
| `ForbiddenError` | 403 |
| `NotFoundError` | 404 |
| `MethodNotAllowedError` | 405 |
| `PayloadTooLargeError` | 413 |
| `UnsupportedMediaTypeError` | 415 |
| `InternalServerError` | 500 (non-exposed) |
| `HttpError(status, message, { expose?, details? })` | custom |

`expose: false` (default for 5xx) hides the message from clients and replaces it with `"Internal Server Error"`.

### `YASWSNodeHTTP` options

```ts
new YASWSNodeHTTP(app, {
  port: 8000,
  host: "0.0.0.0",
  tls: { key, cert, ca },                   // enable HTTPS
  trustedHosts: ["api.example.com"],         // reject Host headers not in list
  limits: {
    maxBodyBytes: 1_000_000,                 // default 1 MB
    headersTimeoutMs: 60_000,
    requestTimeoutMs: 30_000,
    keepAliveTimeoutMs: 5_000,
    maxHeadersCount: 100,
  },
  drainTimeoutMs: 30_000,                    // graceful shutdown deadline
  handleSignals: true,                       // SIGINT + SIGTERM
})
```

### `YASWSWasiHTTP` shape

```ts
new YASWSWasiHTTP(handler, wasiHttpBindings, { maxBodyBytes? })
```

`wasiHttpBindings` must satisfy `WasiHttpBindings` — supply the host-resolved `wasi:http/types@0.2.x` module. The adapter never imports a WASI module statically so it remains safe to include in a node-only build.

For a one-shot per-request invocation (when wiring the export manually), use:

```ts
yasswsWasiHttpHandle(handler, incomingRequest, responseOut, bindings)
```

### Security middleware

```ts
import { secureHeaders, cors, rateLimit } from "yasws"

dispatcher.addResponseInterceptor(secureHeaders({
  hsts: { maxAge: 31_536_000, includeSubDomains: true },
  contentSecurityPolicy: "default-src 'self'",
}))

const c = cors({ origin: ["https://example.com"], credentials: true })
dispatcher.addMiddleware(c)
dispatcher.addResponseInterceptor(c.intercept)

dispatcher.addMiddleware(rateLimit({ windowMs: 60_000, max: 100 }))
```

### Templater

```ts
const templater = await Templater.create("./templates", LoadStrategy.UTR)
const res = await templater.renderHTML("home.ejs", { user: "Ada" })
```

Path-traversal hardened: `../` and absolute paths are rejected.

## Common patterns

### Test a handler in-process

```ts
const app = new Dispatcher()
app.addRouter(new UserController())
const res = await app.inject({ method: "GET", url: "/users/42" })
expect(res.statusCode).toBe(200)
expect(JSON.parse(res.data.toString())).toEqual({ id: "42", name: "Ada" })
```

### Conditional handler via filter

```ts
class AuthFilter implements Filter {
  async call(req: YasswsRequest) {
    const token = req.header("authorization")
    if (!token) throw new UnauthorizedError()
    return true
  }
}

@Get("/me")
@UseFilters(new AuthFilter())
async me(req: YasswsRequest) { return YasswsResponse.json({ id: req.args.userId }) }
```

### Multi-method endpoint

```ts
@All("/echo")
async echo(req: YasswsRequest) {
  return YasswsResponse.json({ method: req.method, params: req.params, query: Object.fromEntries(req.query) })
}
```

### Streaming-ish large response

Buffer-based for now. Set `data: Buffer.from(...)` on the response. True streaming is on the roadmap.

## Things to NOT do

- **Do not import `node:http` in handlers or controllers.** That breaks the WASI target.
- **Do not call `dispatcher.dispatch(req)` from handler code.** It's the transport's entry point.
- **Do not return a plain `{ statusCode, contentType, data }`** when you can return `YasswsResponse` — both work, but the class gets type-checked headers and factory helpers.
- **Do not parse `request.url` manually for the query string.** Use `request.query`.
- **Do not set `Content-Length` yourself.** The transport computes it correctly (byte length, not string length).
- **Do not `process.exit()` on SIGINT.** The node-http transport drains in-flight requests before exit; let it.

## Migration from v1

1. Replace `import type { Request } from "yasws"` with `YasswsRequest` (both names still exported; the alias is `Request`).
2. Filter `call(request: http.IncomingMessage)` → `call(request: YasswsRequest)`.
3. `handleUnhandled(req, res)` → return a `YasswsResponse` (or override `onNotFound`). The transport now writes responses for you.
4. `dispatcher.run()` → split into `new YASWSNodeHTTP(dispatcher, opts).listen()`.
5. `new SomeDispatcher()` with no args worked by accident in v1 and now does so on purpose (options default to `{}`).
