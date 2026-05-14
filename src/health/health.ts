/**
 * Health-check router. Returns a Router suitable for `app.addRouter(...)`:
 *
 *   app.addRouter(healthRouter({
 *     liveness: "/healthz",
 *     readiness: "/ready",
 *     checks: {
 *       db: async () => ({ ok: await db.ping() }),
 *       upstream: async () => ({ ok: true, latencyMs: 12 }),
 *     },
 *   }))
 *
 * Liveness always returns 200 (process is up). Readiness runs each check and
 * returns 503 if any check returns `ok: false` or throws.
 */

import { Router } from "../server/router.js"
import { Method } from "../server/method.js"
import { YasswsResponse } from "../server/response.js"

export { healthRouter, type HealthCheckFn, type HealthOptions }

type HealthCheckFn = () => HealthCheckResult | Promise<HealthCheckResult>

interface HealthCheckResult {
    ok: boolean
    [key: string]: unknown
}

interface HealthOptions {
    liveness?: string
    readiness?: string
    checks?: Record<string, HealthCheckFn>
    /** Per-check timeout in ms. Default: 2000. Checks that exceed it count as failures. */
    timeoutMs?: number
}

function healthRouter(opts: HealthOptions = {}): Router {
    const r = new Router({ name: "Health" })
    const liveness = opts.liveness ?? "/healthz"
    const readiness = opts.readiness ?? "/ready"
    const timeoutMs = opts.timeoutMs ?? 2000
    const checks = opts.checks ?? {}

    r.addHandler({
        method: Method.GET,
        path: stripLeadingSlash(liveness),
        function: () => YasswsResponse.json({ status: "ok", uptime: process.uptime?.() ?? null }),
    })

    r.addHandler({
        method: Method.GET,
        path: stripLeadingSlash(readiness),
        function: async () => {
            const results: Record<string, unknown> = {}
            let overallOk = true
            await Promise.all(Object.entries(checks).map(async ([name, fn]) => {
                try {
                    const r = await raceTimeout(fn(), timeoutMs)
                    results[name] = r
                    if (!r.ok) overallOk = false
                } catch (err) {
                    overallOk = false
                    results[name] = { ok: false, error: err instanceof Error ? err.message : String(err) }
                }
            }))
            const body = { status: overallOk ? "ok" : "fail", checks: results }
            return YasswsResponse.json(body, overallOk ? 200 : 503)
        },
    })

    return r
}

function stripLeadingSlash(p: string): string {
    return p.startsWith("/") ? p.slice(1) : p
}

async function raceTimeout<T>(p: Promise<T> | T, ms: number): Promise<T> {
    if (!(p instanceof Promise)) return p
    return await new Promise<T>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`check timed out after ${ms}ms`)), ms)
        p.then((v) => { clearTimeout(t); resolve(v) }, (e) => { clearTimeout(t); reject(e) })
    })
}
