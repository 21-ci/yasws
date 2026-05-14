import type { YasswsRequest } from "./request.js"

export type { Filter }

/**
 * Filter — pre-handler guard. Returning false (or a rejected promise) skips
 * the handler this filter guards. Filters may be async.
 */
interface Filter {
    call(request: YasswsRequest): boolean | Promise<boolean>
}
