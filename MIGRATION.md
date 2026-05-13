# Migrating from YASWS v1 to v2

v2 is the WASI-ready, security-hardened rewrite. The public surface is mostly back-compatible — most v1 apps need only the changes below to compile.

## 1. Dispatcher no longer starts the server itself

**v1**
```ts
const app = new MyDispatcher()
app.addRouter(router)
app.run(8000)
```

**v2**
```ts
import { YASWSNodeHTTP } from "yasws"

const app = new MyDispatcher()
app.addRouter(router)
await new YASWSNodeHTTP(app, { port: 8000 }).listen()
```

The Dispatcher is now transport-agnostic. Pick a transport:

- `YASWSNodeHTTP` — node:http / HTTPS
- `YASWSWasiHTTP` — wasi:http/incoming-handler@0.2.x
- `dispatcher.inject({...})` — in-process for tests

## 2. `handleUnhandled` signature changed

**v1** got `(req, res)` and wrote to `res` itself.
**v2** gets `(req)` and returns a `YasswsResponse` (or implements `setNotFoundHandler`).

```ts
class MyDispatcher extends Dispatcher {
  async handleUnhandled(req: YasswsRequest) {
    return YasswsResponse.html("<h1>404</h1>", 404)
  }
}
```

The transport writes the response — your handler never touches a socket.

## 3. `Request` is now `YasswsRequest`

The interface is still exported under the alias `Request`. Imports keep working. The class has new methods you'll likely want to use:

```ts
request.params.id           // path param
request.query.get("expand") // URLSearchParams
await request.json()        // parsed body, with size + content-type guards
```

`request.clientRequest` (the raw `IncomingMessage`) is no longer present. Code that reached into it must use the new accessors or run only under `node:http` — in which case keep the transport in your project and access the IncomingMessage there.

## 4. Filters can now be async

**v1**
```ts
interface Filter { call(req: http.IncomingMessage): boolean }
```

**v2**
```ts
interface Filter { call(req: YasswsRequest): boolean | Promise<boolean> }
```

Existing sync filters still work.

## 5. Constructor signature for `Router` / `Dispatcher`

v1 already used an options object internally. v2 makes options optional and supports `@Controller`:

```ts
@Controller("/users")
class UserController extends Router {}   // rootPath = "/users/"
new UserController()                      // works
new UserController({ name: "Users" })     // overrides allowed
```

The `name` / `rootPath` / `logger` / `defaultHeaders` keys are unchanged.

## 6. New: typed errors

Replace ad-hoc 4xx responses with typed errors:

```ts
throw new BadRequestError("missing 'name'")
throw new UnauthorizedError()
throw new HttpError(418, "I'm a teapot")
```

The dispatcher's default error handler renders them; override with `setErrorHandler` for custom shape.

## 7. New: response interceptors

`Helmet`-equivalent and CORS work as response interceptors:

```ts
import { secureHeaders, cors } from "yasws"

dispatcher.addResponseInterceptor(secureHeaders())
const c = cors({ origin: ["https://app.example.com"] })
dispatcher.addMiddleware(c)
dispatcher.addResponseInterceptor(c.intercept)
```

## 8. New: per-handler middleware and filters via decorators

```ts
@Get("/:id")
@UseFilters(authFilter)
@UseMiddleware(traceMiddleware)
async findOne(req: YasswsRequest) { ... }
```

## 9. Method enum: `TRACES` is now `TRACE`

If you used `Method.TRACES` (the typo from v1), rename. `Method.ALL` is new for any-method routes.

## 10. Logger no longer auto-attached to every Router

v1 added a `LoggerMiddleware` to every Router constructor, which means nested routers ran it once per level. v2 exposes `request.logger` directly. `LoggerMiddleware` is still exported and works if you need `request.args.logger`.

## 11. Path parameters

Routes can now contain `:name` segments and `*tail` wildcards:

```ts
@Get("/:id")                     // request.params.id
@Get("/:org/repos/:repo")        // request.params.org, .repo
@Get("/files/*path")             // request.params.path = "a/b/c"
```

## What you don't need to change

- `@Route(path, method, [filters])` still works.
- `HandlerResponse` interface still works; handlers can return a plain object.
- `Templater` keeps its API (`renderHTML(name, args)`).
- `HTMLResponse` still works.
- `Logger` API is unchanged.
