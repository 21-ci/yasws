import { YasswsRequest } from "../server/request.js"
import { YasswsResponse } from "../server/response.js"
import type { Middleware } from "../server/middleware.js"
import type { ResponseInterceptor } from "../server/router.js"

export { CorsMiddleware, cors, type CorsOptions }

interface CorsOptions {
    /** Allowed origins. "*" allows all (incompatible with credentials). Function for dynamic. */
    origin?: string | string[] | ((origin: string | undefined) => string | false | undefined)
    methods?: string[]
    allowedHeaders?: string[]
    exposedHeaders?: string[]
    credentials?: boolean
    maxAge?: number
}

/**
 * CORS handling, split into:
 *   - middleware: short-circuits OPTIONS preflight with a 204
 *   - interceptor: attaches Access-Control-* headers to every response
 *
 * Register both on the Dispatcher for full coverage:
 *
 *   const c = new CorsMiddleware({ origin: ["https://example.com"], credentials: true })
 *   dispatcher.addMiddleware(c)
 *   dispatcher.addResponseInterceptor(c.intercept)
 */
class CorsMiddleware implements Middleware {
    private readonly opts: Required<CorsOptions>

    public constructor(opts: CorsOptions = {}) {
        this.opts = {
            origin: opts.origin ?? "*",
            methods: opts.methods ?? ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            allowedHeaders: opts.allowedHeaders ?? ["Content-Type", "Authorization"],
            exposedHeaders: opts.exposedHeaders ?? [],
            credentials: opts.credentials ?? false,
            maxAge: opts.maxAge ?? 600,
        }
    }

    private resolveOrigin(origin: string | undefined): string | undefined {
        const conf = this.opts.origin
        if (typeof conf === "function") return conf(origin) || undefined
        if (Array.isArray(conf)) return origin && conf.includes(origin) ? origin : undefined
        if (conf === "*") return "*"
        return conf === origin ? origin : undefined
    }

    public call(request: YasswsRequest): YasswsResponse | void {
        if (request.method !== "OPTIONS") return
        if (!request.header("access-control-request-method")) return

        const origin = request.header("origin")
        const allowed = this.resolveOrigin(origin)
        const res = YasswsResponse.empty(204)
        if (allowed) res.setHeader("Access-Control-Allow-Origin", allowed)
        if (this.opts.credentials) res.setHeader("Access-Control-Allow-Credentials", "true")
        res.setHeader("Access-Control-Allow-Methods", this.opts.methods.join(", "))
        res.setHeader("Access-Control-Allow-Headers", this.opts.allowedHeaders.join(", "))
        res.setHeader("Access-Control-Max-Age", String(this.opts.maxAge))
        res.setHeader("Vary", "Origin")
        return res
    }

    public intercept: ResponseInterceptor = (request, response) => {
        const origin = request.header("origin")
        const allowed = this.resolveOrigin(origin)
        if (allowed) {
            response.setHeader("Access-Control-Allow-Origin", allowed)
            response.setHeader("Vary", "Origin")
            if (this.opts.credentials) response.setHeader("Access-Control-Allow-Credentials", "true")
            if (this.opts.exposedHeaders.length) {
                response.setHeader("Access-Control-Expose-Headers", this.opts.exposedHeaders.join(", "))
            }
        }
        return response
    }
}

function cors(opts: CorsOptions = {}): CorsMiddleware {
    return new CorsMiddleware(opts)
}
