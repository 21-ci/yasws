import { Router, UNHANDLED, type RouterOptions, type ResponseInterceptor } from "./router.js"
import { YasswsResponse, isResponse, toResponse, type HandlerResponse } from "./response.js"
import { YasswsRequest } from "./request.js"
import { HttpError } from "./errors.js"
import { LifecycleManager, type LifecycleHook } from "./lifecycle.js"

export { Dispatcher, type DispatcherOptions, type AppHandler, type ErrorHook, type NotFoundHook }

type AppHandler = (request: YasswsRequest) => Promise<YasswsResponse>

type ErrorHook = (request: YasswsRequest, error: unknown) => Promise<HandlerResponse | YasswsResponse | void> | HandlerResponse | YasswsResponse | void
type NotFoundHook = (request: YasswsRequest) => Promise<HandlerResponse | YasswsResponse | void> | HandlerResponse | YasswsResponse | void

interface DispatcherOptions extends RouterOptions {
    onError?: ErrorHook
    onNotFound?: NotFoundHook
}

/**
 * Dispatcher is a transport-agnostic Router that exposes a pure
 * `dispatch(request) -> response` entry point. Bind it to a transport
 * (YASWSNodeHTTP, YASWSWasiHTTP, …) to actually serve traffic.
 *
 * Override `onError` and `onNotFound` to customize error / 404 behavior.
 * `handleUnhandled` is kept as a v1-compatible alias for `onNotFound`.
 */
class Dispatcher extends Router {
    private errorHook: ErrorHook | undefined
    private notFoundHook: NotFoundHook | undefined
    private readonly lifecycle = new LifecycleManager()

    public constructor(opts: DispatcherOptions = {}) {
        super({
            name: opts.name ?? "YASWS App",
            rootPath: opts.rootPath ?? "/",
            dispatcherPath: "",
            ...(opts.logger ? { logger: opts.logger } : {}),
            ...(opts.defaultHeaders ? { defaultHeaders: opts.defaultHeaders } : {}),
        })
        this.fullPath = this.rootPath
        this.dispatcherPath = ""
        this.errorHook = opts.onError
        this.notFoundHook = opts.onNotFound
    }

    public setErrorHandler(hook: ErrorHook): this {
        this.errorHook = hook
        return this
    }

    public setNotFoundHandler(hook: NotFoundHook): this {
        this.notFoundHook = hook
        return this
    }

    /** Register a hook to run when the dispatcher starts (transport `listen`). */
    public onStart(hook: LifecycleHook): this {
        this.lifecycle.onStart(hook)
        return this
    }

    /** Register a hook to run when the dispatcher shuts down (transport `close`). */
    public onShutdown(hook: LifecycleHook): this {
        this.lifecycle.onShutdown(hook)
        return this
    }

    /** Idempotent. Runs all `onStart` hooks; transports call this from `listen()`. */
    public async start(): Promise<void> {
        await this.lifecycle.start()
    }

    /** Runs all `onShutdown` hooks in reverse order. Transports call this from `close()`. */
    public async shutdown(): Promise<void> {
        await this.lifecycle.shutdown()
    }

    /**
     * Default error handler. Translates `HttpError` to its statusCode; logs and
     * returns a generic 500 for unknown errors.
     */
    public async onError(request: YasswsRequest, error: unknown): Promise<YasswsResponse> {
        if (this.errorHook) {
            const r = await this.errorHook(request, error)
            if (r && isResponse(r)) return toResponse(r)
        }
        if (error instanceof HttpError) {
            const body = error.expose
                ? { error: error.message, ...(error.details !== undefined ? { details: error.details } : {}) }
                : { error: "Internal Server Error" }
            return YasswsResponse.json(body, error.statusCode)
        }
        this.logger.error(`unhandled error on ${request.method} ${request.path}`, String((error as Error)?.stack ?? error))
        return YasswsResponse.json({ error: "Internal Server Error" }, 500)
    }

    /** Default not-found handler. */
    public async onNotFound(request: YasswsRequest): Promise<YasswsResponse> {
        if (this.notFoundHook) {
            const r = await this.notFoundHook(request)
            if (r && isResponse(r)) return toResponse(r)
        }
        const r = await this.handleUnhandled(request)
        if (r && isResponse(r)) return toResponse(r)
        return YasswsResponse.json({ error: "Not Found", path: request.path }, 404)
    }

    /** v1-compat hook. Subclassing dispatcher and overriding this still works. */
    public async handleUnhandled(_request: YasswsRequest): Promise<HandlerResponse | YasswsResponse | void> {
        return
    }

    /** Pure entry point. Transports call this. */
    public async dispatch(request: YasswsRequest): Promise<YasswsResponse> {
        if (!request.logger) request.logger = this.logger
        try {
            const result = await this.handle(request)
            if (result === UNHANDLED) return await this.onNotFound(request)
            return result
        } catch (err) {
            try {
                return await this.onError(request, err)
            } catch (innerErr) {
                this.logger.error("error handler itself threw", String((innerErr as Error)?.stack ?? innerErr))
                return YasswsResponse.json({ error: "Internal Server Error" }, 500)
            }
        }
    }

    /** Returns a bound handler suitable for direct use by transports / tests. */
    public toHandler(): AppHandler {
        return (req) => this.dispatch(req)
    }

    /**
     * In-process test client. Inject a synthetic request without binding a socket.
     *
     *   const res = await dispatcher.inject({ method: "GET", url: "/users/42" })
     */
    public async inject(init: {
        method?: string
        url?: string
        headers?: Record<string, string | string[]>
        body?: string | Uint8Array
    }): Promise<YasswsResponse> {
        const method = init.method ?? "GET"
        const url = init.url ?? "/"
        const headers = init.headers ?? {}
        const bodyBuf = init.body === undefined
            ? undefined
            : (typeof init.body === "string" ? new TextEncoder().encode(init.body) : init.body)
        const qIdx = url.indexOf("?")
        const path = qIdx >= 0 ? url.slice(0, qIdx) : url
        const normalizedPath = path.endsWith("/") ? path : path + "/"
        const req = new YasswsRequest({
            method,
            url,
            path: normalizedPath,
            headers,
            host: "localhost",
            ...(bodyBuf !== undefined ? { bodyReader: async () => bodyBuf } : {}),
            logger: this.logger,
        })
        return await this.dispatch(req)
    }
}
