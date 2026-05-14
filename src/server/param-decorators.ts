/**
 * Parameter decorators — Nest-style `@Body`, `@Query`, `@Param`, `@Headers`, `@Req`.
 *
 *   @Get("/:id")
 *   async findOne(
 *       @Param("id") id: string,
 *       @Query("expand") expand: string | undefined,
 *   ) { ... }
 *
 * When at least one parameter on a method is decorated, the router invokes the
 * handler with positional arguments resolved from the request. Methods with no
 * parameter decorators still receive `(request: YasswsRequest)` as before.
 */

import { BadRequestError } from "./errors.js"
import { getOrInitMeta, type ParamDef, type ParamExtractor } from "./metadata.js"
import type { YasswsRequest } from "./request.js"

export { Body, Query, Param, Headers, Req, Request as RequestParam }

interface ParseableSchema<T = unknown> {
    parse(input: unknown): T
}

function pushParam(
    target: object,
    propertyKey: string | symbol,
    index: number,
    extract: ParamExtractor,
    schema?: ParseableSchema,
    openapi?: ParamDef["openapi"],
): void {
    const fn = (target as Record<string | symbol, unknown>)[propertyKey] as object | undefined
    if (!fn) return
    const meta = getOrInitMeta(fn)
    if (!meta.params) meta.params = []
    const def: ParamDef = { index, extract }
    if (schema) def.schema = schema
    if (openapi) def.openapi = openapi
    meta.params.push(def)
}

/**
 * `@Body()` / `@Body(schema)` — JSON body, optionally validated.
 * Schema is any object with `.parse(input) => T` (Zod, Yup, custom).
 */
function Body(schema?: ParseableSchema) {
    return function (target: object, propertyKey: string | symbol, parameterIndex: number) {
        pushParam(
            target,
            propertyKey,
            parameterIndex,
            async (req) => req.json(),
            schema,
            { kind: "body", required: true },
        )
    }
}

/**
 * `@Query("name")` — single query parameter as string.
 * `@Query()` — entire `URLSearchParams`.
 */
function Query(name?: string, schema?: ParseableSchema) {
    return function (target: object, propertyKey: string | symbol, parameterIndex: number) {
        const extract: ParamExtractor = name
            ? (req) => req.query.get(name) ?? undefined
            : (req) => req.query
        const openapi: ParamDef["openapi"] = name
            ? { kind: "query", name, required: false }
            : { kind: "query" }
        pushParam(target, propertyKey, parameterIndex, extract, schema, openapi)
    }
}

/**
 * `@Param("id")` — single path parameter.
 * `@Param()` — entire params object.
 */
function Param(name?: string, schema?: ParseableSchema) {
    return function (target: object, propertyKey: string | symbol, parameterIndex: number) {
        const extract: ParamExtractor = name
            ? (req) => {
                const v = req.params[name]
                if (v === undefined) throw new BadRequestError(`missing path param '${name}'`)
                return v
            }
            : (req) => req.params
        const openapi: ParamDef["openapi"] = name
            ? { kind: "path", name, required: true }
            : { kind: "path" }
        pushParam(target, propertyKey, parameterIndex, extract, schema, openapi)
    }
}

/**
 * `@Headers("authorization")` — single header value.
 * `@Headers()` — entire headers map.
 */
function Headers(name?: string, schema?: ParseableSchema) {
    return function (target: object, propertyKey: string | symbol, parameterIndex: number) {
        const extract: ParamExtractor = name
            ? (req) => req.header(name)
            : (req) => req.headers
        const openapi: ParamDef["openapi"] | undefined = name
            ? { kind: "header", name, required: false }
            : undefined
        pushParam(target, propertyKey, parameterIndex, extract, schema, openapi)
    }
}

/** `@Req()` — the full YasswsRequest. */
function Req() {
    return function (target: object, propertyKey: string | symbol, parameterIndex: number) {
        pushParam(target, propertyKey, parameterIndex, (req) => req)
    }
}
const Request = Req
