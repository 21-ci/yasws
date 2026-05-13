# 01 — Hello, node:http

The smallest possible YASWS app on Node's built-in HTTP server.

## What it covers

- `@Controller` + `@Get` / `@Post` decorators
- Path params (`/hi/:name`)
- JSON request bodies with size limits
- `secureHeaders()` response interceptor (Helmet equivalent)
- Typed errors (`BadRequestError`)
- Graceful shutdown (SIGINT/SIGTERM are wired by `YASWSNodeHTTP` automatically)

## Run it

```sh
npm install
npm run build
npm start
```

Then in another shell:

```sh
curl http://localhost:8000/
curl http://localhost:8000/hi/world
curl -X POST http://localhost:8000/echo \
     -H 'content-type: application/json' \
     -d '{"a":1,"b":[2,3]}'
```

Hit `Ctrl-C` — the server drains in-flight requests before exiting.

## Notes

- `Dispatcher` is **transport-agnostic** — nothing in `HelloController` is tied to `node:http`. Compare against `examples/02-hello-wasi` for the same handler over WASI.
- All security defaults (`secureHeaders`, 1 MiB body limit, 30 s request timeout) are opt-in. Override the `limits` block on `YASWSNodeHTTP` for production.
