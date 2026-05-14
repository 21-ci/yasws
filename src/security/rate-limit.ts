import { YasswsRequest } from "../server/request.js"
import { YasswsResponse } from "../server/response.js"
import type { Middleware } from "../server/middleware.js"

export { RateLimit, rateLimit, type RateLimitOptions, type RateLimitKeyFn }

type RateLimitKeyFn = (request: YasswsRequest) => string

interface RateLimitOptions {
    windowMs?: number          // sliding window length, default 60_000
    max?: number               // requests per window per key, default 60
    keyFn?: RateLimitKeyFn     // default: x-forwarded-for[0] || remoteAddress || "unknown"
    message?: string
    /** Set Retry-After / X-RateLimit-* headers. Default true. */
    standardHeaders?: boolean
}

/**
 * Naive in-memory rate limit. Single-process only (no cross-instance state) —
 * fine for local dev or single-worker deploys; in a fleet, put a reverse-proxy
 * limiter (nginx, Envoy, Cloudflare) or Redis-backed limiter in front.
 *
 *   dispatcher.addMiddleware(rateLimit({ windowMs: 60_000, max: 100 }))
 */
class RateLimit implements Middleware {
    private readonly opts: Required<RateLimitOptions>
    private readonly buckets = new Map<string, { count: number; resetAt: number }>()

    public constructor(opts: RateLimitOptions = {}) {
        this.opts = {
            windowMs: opts.windowMs ?? 60_000,
            max: opts.max ?? 60,
            keyFn: opts.keyFn ?? defaultKeyFn,
            message: opts.message ?? "Too Many Requests",
            standardHeaders: opts.standardHeaders ?? true,
        }
    }

    public call(request: YasswsRequest): YasswsResponse | void {
        const key = this.opts.keyFn(request)
        const now = Date.now()
        let bucket = this.buckets.get(key)
        if (!bucket || bucket.resetAt <= now) {
            bucket = { count: 0, resetAt: now + this.opts.windowMs }
            this.buckets.set(key, bucket)
        }
        bucket.count += 1

        if (bucket.count > this.opts.max) {
            const res = YasswsResponse.json({ error: this.opts.message }, 429)
            if (this.opts.standardHeaders) {
                res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)))
                res.setHeader("X-RateLimit-Limit", String(this.opts.max))
                res.setHeader("X-RateLimit-Remaining", "0")
                res.setHeader("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)))
            }
            return res
        }

        if (this.opts.standardHeaders) {
            request.args._rateLimit = {
                limit: this.opts.max,
                remaining: this.opts.max - bucket.count,
                resetAt: bucket.resetAt,
            }
        }
        return
    }
}

function rateLimit(opts: RateLimitOptions = {}): RateLimit {
    return new RateLimit(opts)
}

function defaultKeyFn(req: YasswsRequest): string {
    const fwd = req.header("x-forwarded-for")
    if (fwd) return fwd.split(",")[0]!.trim()
    return req.remoteAddress ?? "unknown"
}
