import type { YasswsRequest } from "./request.js"
import type { YasswsResponse } from "./response.js"

export type { Middleware, MiddlewareResult }

/**
 * A middleware step result:
 *  - YasswsRequest: continue, replacing the request with this one
 *  - YasswsResponse: short-circuit, send this response immediately
 *  - void / undefined: continue with the unchanged request
 *  - false / null: hard-stop, no response will be produced (legacy)
 */
type MiddlewareResult =
    | YasswsRequest
    | YasswsResponse
    | void
    | undefined
    | false
    | null

/**
 * Middleware — runs on every request that reaches this router.
 *
 *   call(req)      — runs BEFORE handler matching ("pre-route")
 *   postRoute(req) — runs AFTER a handler is matched but BEFORE it executes
 */
interface Middleware {
    call?(request: YasswsRequest): MiddlewareResult | Promise<MiddlewareResult>
    postRoute?(request: YasswsRequest): MiddlewareResult | Promise<MiddlewareResult>
}
