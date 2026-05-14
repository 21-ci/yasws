import type { Middleware, YasswsRequest, MiddlewareResult } from "yasws"

/**
 * Adds a `request.args.requestId` so handlers/exception filters can correlate
 * logs. Reads `x-request-id` if the caller supplied one, otherwise mints a
 * short random id.
 */
export class TraceMiddleware implements Middleware {
    public call(request: YasswsRequest): MiddlewareResult {
        const supplied = request.header("x-request-id")
        request.args.requestId = supplied ?? Math.random().toString(36).slice(2, 10)
        return request
    }
}
