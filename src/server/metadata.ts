/**
 * Shared per-handler metadata registry. Decorators write here; the Router reads
 * it during invocation to wire up parameters, status code overrides, headers,
 * redirects, exception filters, and OpenAPI documentation.
 *
 * Keyed by the handler function reference (the same reference captured in
 * Router._handlers and walked via prototype chain).
 */

import type { YasswsRequest } from "./request.js"

export {
    HANDLER_METADATA,
    getMeta,
    getOrInitMeta,
    type HandlerMetadata,
    type ParamDef,
    type ParamExtractor,
}

/** A schema-like type with at least a `parse` method (Zod-compatible). */
export interface ParseableSchema<T = unknown> {
    parse(input: unknown): T
}

type ParamExtractor = (request: YasswsRequest) => unknown | Promise<unknown>

interface ParamDef {
    index: number
    extract: ParamExtractor
    schema?: ParseableSchema
    /** Optional OpenAPI hint for `@Body`, `@Param`, `@Query`, `@Header` etc. */
    openapi?: ParamOpenApiHint
}

interface ParamOpenApiHint {
    kind: "body" | "query" | "path" | "header"
    name?: string
    required?: boolean
    jsonSchema?: unknown
    description?: string
}

interface OpenApiResponseDoc {
    status: number
    description?: string
    jsonSchema?: unknown
    contentType?: string
}

interface OpenApiHandlerMetadata {
    tags?: string[]
    summary?: string
    description?: string
    deprecated?: boolean
    bearerAuth?: boolean
    operationId?: string
    responses?: OpenApiResponseDoc[]
    requestBody?: { jsonSchema?: unknown; required?: boolean; contentType?: string; description?: string }
    extraParameters?: Array<{ in: "query" | "path" | "header"; name: string; required?: boolean; jsonSchema?: unknown; description?: string }>
}

interface ExceptionFilterLike {
    catch(error: unknown, request: YasswsRequest): unknown
}

interface HandlerMetadata {
    /** Parameter decorators (`@Body`, `@Query`, `@Param`, `@Headers`, `@Req`). */
    params?: ParamDef[]
    /** Override default 200 status code from `@HttpCode`. */
    httpCode?: number
    /** Static response headers from `@SetHeader`. */
    setHeaders?: Array<{ name: string; value: string }>
    /** Redirect target from `@Redirect`. */
    redirect?: { location: string; statusCode: number }
    /** Per-handler exception filters from `@UseExceptionFilters`. */
    exceptionFilters?: ExceptionFilterLike[]
    /** OpenAPI metadata accumulated from `@Api*` decorators. */
    openapi?: OpenApiHandlerMetadata
}

const HANDLER_METADATA = new WeakMap<object, HandlerMetadata>()

function getOrInitMeta(fn: object): HandlerMetadata {
    let m = HANDLER_METADATA.get(fn)
    if (!m) {
        m = {}
        HANDLER_METADATA.set(fn, m)
    }
    return m
}

function getMeta(fn: object): HandlerMetadata | undefined {
    return HANDLER_METADATA.get(fn)
}
