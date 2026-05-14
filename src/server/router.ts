import { matchPath } from "./params.js"
import { normalizePath, addEndSlash, removeEndSlash } from "./helpers.js"
import { Method, normalizeMethod } from "./method.js"
import { YasswsRequest } from "./request.js"
import { YasswsResponse, isResponse, toResponse } from "./response.js"
import type { Filter } from "./filter.js"
import type { Middleware } from "./middleware.js"
import type { Handler, HandlerFunction, HandlerSpec } from "./handler.js"
import type { Header } from "./header.js"
import { defaultLogger, type Logger } from "../logger.js"
import { getMeta, type HandlerMetadata } from "./metadata.js"
import { BadRequestError } from "./errors.js"

export { Router, Route, type RouterOptions, type ResponseInterceptor, UNHANDLED }

/** Sentinel returned by `Router.handle` when no handler matched. */
const UNHANDLED: unique symbol = Symbol("yasws.unhandled")

type ResponseInterceptor = (request: YasswsRequest, response: YasswsResponse) => YasswsResponse | Promise<YasswsResponse>

interface RouterOptions {
    name?: string
    rootPath?: string
    dispatcherPath?: string
    logger?: Logger
    defaultHeaders?: Header[]
}

class Router {
    public name: string | undefined
    public rootPath: string
    public dispatcherPath: string
    public fullPath: string
    public defaultHeaders: Header[]
    public logger: Logger
    protected handlers: Handler[]
    protected subrouters: Router[]
    protected middlewares: Middleware[]
    protected responseInterceptors: ResponseInterceptor[]

    public constructor(opts: RouterOptions = {}) {
        const controllerRoot = (this.constructor as { _controllerRootPath?: string })._controllerRootPath
        this.rootPath = normalizePath(opts.rootPath ?? controllerRoot ?? "")
        this.dispatcherPath = normalizePath(opts.dispatcherPath ?? "")
        this.logger = opts.logger ?? defaultLogger
        this.name = opts.name
        this.fullPath = `${this.dispatcherPath}${this.rootPath}`
        this.defaultHeaders = opts.defaultHeaders ? [...opts.defaultHeaders] : []
        this.subrouters = []
        this.middlewares = []
        this.responseInterceptors = []
        this.handlers = collectDecoratorHandlers(this.constructor)
        for (const h of this.handlers) h.instance = this

        if (this.handlers.length > 0) {
            const lines = this.handlers.map(h => `- ${h.path || "/"}: ${h.function.name || "anonymous"} (${h.method})`)
            this.logger.debug(`* Router ${this.constructor.name} (path "${this.fullPath}") has ${this.handlers.length} handler(s):\n${lines.join("\n")}`)
        }
    }

    public addRouter<R extends Router>(router: R): this {
        router.dispatcherPath = `${this.dispatcherPath}${this.rootPath}`
        router.fullPath = `${router.dispatcherPath}${router.rootPath}`
        router.defaultHeaders = [...this.defaultHeaders, ...router.defaultHeaders]
        for (const sub of router.subrouters) Router.rebasePaths(sub, router.fullPath)
        this.subrouters.push(router)
        this.logger.debug(`% Added router ${router.name ?? router.constructor.name} to ${this.constructor.name} (path "${router.fullPath}")`)
        return this
    }

    private static rebasePaths(router: Router, newDispatcherPath: string): void {
        router.dispatcherPath = newDispatcherPath
        router.fullPath = `${router.dispatcherPath}${router.rootPath}`
        for (const sub of router.subrouters) Router.rebasePaths(sub, router.fullPath)
    }

    public addMiddleware<M extends Middleware>(middleware: M): this {
        this.middlewares.push(middleware)
        this.logger.debug(`% Added middleware ${middleware.constructor.name} to ${this.constructor.name}`)
        return this
    }

    public addResponseInterceptor(interceptor: ResponseInterceptor): this {
        this.responseInterceptors.push(interceptor)
        return this
    }

    /**
     * Walk every handler in this router and its sub-routers, yielding the
     * fully-qualified path (relative to the dispatcher root), method, and the
     * underlying Handler. Used by OpenAPI generation and route introspection.
     */
    public *walkRoutes(): IterableIterator<{ method: string; fullPath: string; handler: Handler; router: Router }> {
        for (const h of this.handlers) {
            const fullPath = joinPath(this.fullPath, h.path)
            yield { method: h.method, fullPath, handler: h, router: this }
        }
        for (const sub of this.subrouters) yield* sub.walkRoutes()
    }

    /** Imperative handler registration (alternative to `@Route` decorator). */
    public addHandler(spec: HandlerSpec): this {
        const path = normalizeHandlerPath(spec.path ?? "")
        this.handlers.push({
            path,
            method: normalizeMethod(spec.method ?? Method.GET),
            filters: spec.filters ?? [],
            middlewares: spec.middlewares ?? [],
            function: spec.function,
        })
        return this
    }

    /**
     * Try to handle a request. Returns:
     *  - YasswsResponse on success or short-circuit
     *  - UNHANDLED sentinel if no handler in this router (or its subrouters) matched
     *
     * Exceptions propagate to the Dispatcher's onError hook.
     */
    public async handle(request: YasswsRequest): Promise<YasswsResponse | typeof UNHANDLED> {
        if (!pathMatchesPrefix(request.path, this.fullPath)) return UNHANDLED

        this.logger.debug(`* ${this.constructor.name} considering ${request.method} ${request.path}`)

        // Pre-route middlewares
        for (const m of this.middlewares) {
            if (!m.call) continue
            const r = await m.call(request)
            if (r instanceof YasswsResponse) return this.runInterceptors(request, r)
            if (r === false || r === null) return UNHANDLED
            if (r instanceof YasswsRequest) request = r
        }

        const remainder = stripPrefix(request.path, this.fullPath)

        handlerLoop: for (const handler of this.handlers) {
            const params = matchPath(handler.path, remainder)
            if (!params) continue
            if (handler.method !== Method.ALL && handler.method !== request.method) continue

            request.params = params

            // Filters (async)
            for (const filter of handler.filters) {
                const ok = await filter.call(request)
                if (!ok) {
                    this.logger.debug(`FAILED filter ${filter.constructor.name} on ${handler.path}`)
                    continue handlerLoop
                }
            }

            // Per-handler middlewares
            for (const m of handler.middlewares) {
                if (!m.call) continue
                const r = await m.call(request)
                if (r instanceof YasswsResponse) return this.runInterceptors(request, r)
                if (r === false || r === null) return UNHANDLED
                if (r instanceof YasswsRequest) request = r
            }

            // Router-level post-route middlewares
            for (const m of this.middlewares) {
                if (!m.postRoute) continue
                const r = await m.postRoute(request)
                if (r instanceof YasswsResponse) return this.runInterceptors(request, r)
                if (r === false || r === null) return UNHANDLED
                if (r instanceof YasswsRequest) request = r
            }

            const meta = getMeta(handler.function)

            let result: unknown
            try {
                if (meta?.redirect) {
                    result = YasswsResponse.redirect(meta.redirect.location, meta.redirect.statusCode)
                } else {
                    const args = await resolveHandlerArgs(handler.function, meta, request)
                    result = await handler.function.apply(handler.instance ?? null, args as [YasswsRequest])
                }
            } catch (err) {
                const handled = await runHandlerExceptionFilters(meta, err, request)
                if (handled) {
                    const response = toResponse(handled)
                    applyDefaultHeaders(response, this.defaultHeaders)
                    return this.runInterceptors(request, response)
                }
                throw err
            }

            if (!isResponse(result)) {
                this.logger.warning(`handler ${handler.function.name || "anonymous"} returned no response; falling through`)
                continue
            }

            const response = toResponse(result)
            applyMethodDecoratorEffects(response, meta)
            applyDefaultHeaders(response, this.defaultHeaders)
            return this.runInterceptors(request, response)
        }

        // Subrouters
        for (const sub of this.subrouters) {
            if (!pathMatchesPrefix(request.path, sub.fullPath)) continue
            const r = await sub.handle(request)
            if (r !== UNHANDLED) return this.runInterceptors(request, r)
        }

        return UNHANDLED
    }

    private async runInterceptors(request: YasswsRequest, response: YasswsResponse): Promise<YasswsResponse> {
        let r = response
        for (const interceptor of this.responseInterceptors) {
            r = await interceptor(request, r)
        }
        return r
    }
}

function pathMatchesPrefix(reqPath: string, prefix: string): boolean {
    if (reqPath === prefix) return true
    if (reqPath.startsWith(prefix)) return true
    if (prefix.endsWith("/") && reqPath === removeEndSlash(prefix)) return true
    return false
}

function stripPrefix(reqPath: string, prefix: string): string {
    if (reqPath === prefix || (prefix.endsWith("/") && reqPath === removeEndSlash(prefix))) return ""
    return reqPath.slice(prefix.length)
}

function applyDefaultHeaders(response: YasswsResponse, defaults: Header[]): void {
    for (const h of defaults) {
        if (!response.headers.some(x => x.name.toLowerCase() === h.name.toLowerCase())) {
            response.headers.push(h)
        }
    }
}

function normalizeHandlerPath(p: string): string {
    if (p === "" || p === "/") return ""
    p = p.replace(/^\/+/, "").replace(/\/+$/, "")
    return p
}

function joinPath(base: string, suffix: string): string {
    if (!suffix) return base
    return base.endsWith("/") ? `${base}${suffix}` : `${base}/${suffix}`
}

/** Walk prototype chain and collect handlers registered via `@Route`. */
function collectDecoratorHandlers(ctor: unknown): Handler[] {
    const seen = new Set<string>()
    const out: Handler[] = []
    let c: unknown = ctor
    while (c && (c as { prototype?: unknown }).prototype) {
        const own = (c as { _handlers?: Handler[] })._handlers
        if (own && Object.prototype.hasOwnProperty.call(c, "_handlers")) {
            for (const h of own) {
                const key = `${h.method} ${h.path}`
                if (seen.has(key)) continue
                seen.add(key)
                out.push({ ...h })
            }
        }
        c = Object.getPrototypeOf(c)
    }
    return out
}

async function resolveHandlerArgs(
    fn: HandlerFunction,
    meta: HandlerMetadata | undefined,
    request: YasswsRequest,
): Promise<unknown[]> {
    if (!meta?.params || meta.params.length === 0) return [request]

    const maxIndex = meta.params.reduce((m, p) => Math.max(m, p.index), 0)
    const args: unknown[] = new Array(maxIndex + 1)

    for (const p of meta.params) {
        let value = await p.extract(request)
        if (p.schema) {
            try {
                value = p.schema.parse(value)
            } catch (err) {
                const detail = err instanceof Error ? err.message : String(err)
                throw new BadRequestError(`validation failed: ${detail}`, { cause: err })
            }
        }
        args[p.index] = value
    }
    return args
}

async function runHandlerExceptionFilters(
    meta: HandlerMetadata | undefined,
    err: unknown,
    request: YasswsRequest,
): Promise<YasswsResponse | undefined> {
    if (!meta?.exceptionFilters) return undefined
    for (const filter of meta.exceptionFilters) {
        const r = await filter.catch(err, request)
        if (r instanceof YasswsResponse) return r
    }
    return undefined
}

function applyMethodDecoratorEffects(response: YasswsResponse, meta: HandlerMetadata | undefined): void {
    if (!meta) return
    if (meta.httpCode !== undefined && response.statusCode === 200) {
        response.statusCode = meta.httpCode
    }
    if (meta.setHeaders) {
        for (const h of meta.setHeaders) response.setHeader(h.name, h.value)
    }
}

/**
 * `@Route(path, method?, filters?)` — register a handler on the surrounding class.
 *
 * Back-compatible with v1: third positional argument may be a Filter[]. New code
 * may pass an options object:
 *
 *     @Route("/:id", "GET", { filters: [auth], middlewares: [trace] })
 */
function Route(
    path: string = "",
    method: Method | string = Method.GET,
    filtersOrOpts: Filter[] | { filters?: Filter[]; middlewares?: Middleware[] } = []
) {
    return function (target: object, _propertyKey: string, descriptor: PropertyDescriptor): PropertyDescriptor {
        const handlerFunction = descriptor.value as HandlerFunction & { _filters?: Filter[]; _middlewares?: Middleware[] }
        const normalizedPath = normalizeHandlerPath(path)

        const fromDecorator = Array.isArray(filtersOrOpts)
            ? { filters: filtersOrOpts, middlewares: [] as Middleware[] }
            : { filters: filtersOrOpts.filters ?? [], middlewares: filtersOrOpts.middlewares ?? [] }

        const filters = [...(handlerFunction._filters ?? []), ...fromDecorator.filters]
        const middlewares = [...(handlerFunction._middlewares ?? []), ...fromDecorator.middlewares]

        const ctor = (target as { constructor: { _handlers?: Handler[] } }).constructor
        if (!Object.prototype.hasOwnProperty.call(ctor, "_handlers")) ctor._handlers = []
        ctor._handlers!.push({
            path: normalizedPath,
            method: normalizeMethod(method),
            filters,
            middlewares,
            function: handlerFunction,
        })
        return descriptor
    }
}
