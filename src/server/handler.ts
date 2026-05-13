import type { Filter } from "./filter.js"
import type { Middleware } from "./middleware.js"
import type { YasswsRequest } from "./request.js"
import type { HandlerResponse } from "./response.js"

export type { Handler, HandlerFunction, HandlerSpec }

type HandlerFunction = (request: YasswsRequest) => Promise<HandlerResponse | void> | HandlerResponse | void

interface Handler {
    /** Pattern relative to the owning router (e.g. "/:id"). May contain :param and *wildcard tokens. */
    path: string
    /** HTTP method or "*" for any. */
    method: string
    filters: Filter[]
    middlewares: Middleware[]
    function: HandlerFunction
    /**
     * The controller instance the function should be called against. Bound by
     * the Router constructor when handlers come from decorators, so methods
     * can reference `this.xxx` safely.
     */
    instance?: object
}

interface HandlerSpec {
    path?: string
    method?: string
    filters?: Filter[]
    middlewares?: Middleware[]
    function: HandlerFunction
}
