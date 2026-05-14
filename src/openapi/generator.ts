/**
 * OpenAPI 3.1 spec generator + a small Router that serves the spec and a
 * zero-dependency Stoplight Elements UI page.
 *
 *   const app = new Dispatcher()
 *   app.addRouter(new UsersController())
 *   app.addRouter(openApi(app, { info: { title: "My API", version: "1.0.0" } }))
 *
 * Endpoints registered:
 *   GET /openapi.json   — the spec
 *   GET /docs            — interactive HTML viewer (CDN-loaded, single-file)
 *
 * Pass `{ specPath, docsPath }` to override.
 */

import { Router } from "../server/router.js"
import { Method } from "../server/method.js"
import { YasswsResponse } from "../server/response.js"
import { getMeta } from "../server/metadata.js"
import { CONTROLLER_API_TAGS, CONTROLLER_API_AUTH } from "./decorators.js"

export { buildOpenApiSpec, openApi, type OpenApiInfo, type OpenApiOptions }

interface OpenApiInfo {
    title: string
    version: string
    description?: string
}

interface OpenApiOptions {
    info: OpenApiInfo
    servers?: Array<{ url: string; description?: string }>
    specPath?: string
    docsPath?: string
    /** Default content type for `@Body` requests when no `@ApiBody` is set. */
    defaultBodyContentType?: string
}

interface OpenApiDocument {
    openapi: "3.1.0"
    info: OpenApiInfo
    servers?: Array<{ url: string; description?: string }>
    paths: Record<string, Record<string, unknown>>
    components?: { securitySchemes?: Record<string, unknown> }
    security?: Array<Record<string, string[]>>
}

function buildOpenApiSpec(rootRouter: Router, opts: OpenApiOptions): OpenApiDocument {
    const paths: Record<string, Record<string, unknown>> = {}
    let anyBearer = false

    for (const route of rootRouter.walkRoutes()) {
        const meta = getMeta(route.handler.function)
        const ctor = route.router.constructor as unknown as Record<symbol, unknown>
        const ctorTags = ctor[CONTROLLER_API_TAGS] as string[] | undefined
        const ctorBearer = ctor[CONTROLLER_API_AUTH] as true | undefined

        const oaPath = toOpenApiPath(route.fullPath)
        const methods = route.method === Method.ALL ? ["get", "post", "put", "patch", "delete", "options", "head"] : [route.method.toLowerCase()]

        const tags: string[] = [...(ctorTags ?? []), ...(meta?.openapi?.tags ?? [])]
        const requiresBearer = Boolean(ctorBearer || meta?.openapi?.bearerAuth)
        if (requiresBearer) anyBearer = true

        const operation: Record<string, unknown> = {}
        if (tags.length > 0) operation.tags = [...new Set(tags)]
        if (meta?.openapi?.summary) operation.summary = meta.openapi.summary
        if (meta?.openapi?.description) operation.description = meta.openapi.description
        if (meta?.openapi?.deprecated) operation.deprecated = true
        if (meta?.openapi?.operationId) operation.operationId = meta.openapi.operationId
        if (requiresBearer) operation.security = [{ bearerAuth: [] }]

        const parameters = collectParameters(route.fullPath, meta)
        if (parameters.length > 0) operation.parameters = parameters

        const requestBody = collectRequestBody(meta, opts.defaultBodyContentType ?? "application/json")
        if (requestBody) operation.requestBody = requestBody

        operation.responses = collectResponses(meta)

        for (const m of methods) {
            if (!paths[oaPath]) paths[oaPath] = {}
            paths[oaPath]![m] = operation
        }
    }

    const doc: OpenApiDocument = {
        openapi: "3.1.0",
        info: opts.info,
        paths,
    }
    if (opts.servers) doc.servers = opts.servers
    if (anyBearer) {
        doc.components = {
            securitySchemes: {
                bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
            },
        }
    }
    return doc
}

function toOpenApiPath(yasswsPath: string): string {
    const noTrailing = yasswsPath.length > 1 && yasswsPath.endsWith("/") ? yasswsPath.slice(0, -1) : yasswsPath
    return noTrailing.replace(/\/:([A-Za-z_][A-Za-z0-9_]*)/g, "/{$1}").replace(/\/\*([A-Za-z_][A-Za-z0-9_]*)/g, "/{$1}") || "/"
}

function collectParameters(fullPath: string, meta: ReturnType<typeof getMeta>) {
    const declared: Array<Record<string, unknown>> = []
    const seen = new Set<string>()

    const pathParamRe = /\/:([A-Za-z_][A-Za-z0-9_]*)/g
    const wildParamRe = /\/\*([A-Za-z_][A-Za-z0-9_]*)/g
    for (const m of fullPath.matchAll(pathParamRe)) {
        const name = m[1]!
        if (seen.has(`path:${name}`)) continue
        seen.add(`path:${name}`)
        declared.push({ name, in: "path", required: true, schema: { type: "string" } })
    }
    for (const m of fullPath.matchAll(wildParamRe)) {
        const name = m[1]!
        if (seen.has(`path:${name}`)) continue
        seen.add(`path:${name}`)
        declared.push({ name, in: "path", required: true, schema: { type: "string" } })
    }

    if (meta?.params) {
        for (const p of meta.params) {
            if (!p.openapi || !p.openapi.name) continue
            const inKind: "path" | "query" | "header" =
                p.openapi.kind === "body" ? "query" : (p.openapi.kind as "path" | "query" | "header")
            if (p.openapi.kind === "body") continue
            const key = `${inKind}:${p.openapi.name}`
            if (seen.has(key)) continue
            seen.add(key)
            declared.push({
                name: p.openapi.name,
                in: inKind,
                required: p.openapi.required ?? (inKind === "path"),
                schema: p.openapi.jsonSchema ?? { type: "string" },
                ...(p.openapi.description ? { description: p.openapi.description } : {}),
            })
        }
    }

    if (meta?.openapi?.extraParameters) {
        for (const p of meta.openapi.extraParameters) {
            const key = `${p.in}:${p.name}`
            if (seen.has(key)) continue
            seen.add(key)
            declared.push({
                name: p.name,
                in: p.in,
                required: p.required ?? (p.in === "path"),
                schema: p.jsonSchema ?? { type: "string" },
                ...(p.description ? { description: p.description } : {}),
            })
        }
    }

    return declared
}

function collectRequestBody(meta: ReturnType<typeof getMeta>, defaultContentType: string): Record<string, unknown> | undefined {
    const hasBodyParam = meta?.params?.some(p => p.openapi?.kind === "body")
    const explicit = meta?.openapi?.requestBody
    if (!hasBodyParam && !explicit) return undefined

    const contentType = explicit?.contentType ?? defaultContentType
    const schema = explicit?.jsonSchema ?? {}
    const out: Record<string, unknown> = {
        required: explicit?.required ?? true,
        content: { [contentType]: { schema } },
    }
    if (explicit?.description) out.description = explicit.description
    return out
}

function collectResponses(meta: ReturnType<typeof getMeta>): Record<string, unknown> {
    const responses: Record<string, unknown> = {}
    if (meta?.openapi?.responses) {
        for (const r of meta.openapi.responses) {
            const content: Record<string, unknown> = {}
            if (r.jsonSchema !== undefined) {
                content[r.contentType ?? "application/json"] = { schema: r.jsonSchema }
            }
            responses[String(r.status)] = {
                description: r.description ?? defaultDescription(r.status),
                ...(Object.keys(content).length > 0 ? { content } : {}),
            }
        }
    }
    if (Object.keys(responses).length === 0) {
        responses["200"] = { description: "Success" }
    }
    return responses
}

function defaultDescription(status: number): string {
    if (status >= 200 && status < 300) return "Success"
    if (status === 400) return "Bad Request"
    if (status === 401) return "Unauthorized"
    if (status === 403) return "Forbidden"
    if (status === 404) return "Not Found"
    if (status === 409) return "Conflict"
    if (status === 422) return "Unprocessable Entity"
    if (status === 429) return "Too Many Requests"
    if (status >= 500) return "Server Error"
    return "Response"
}

/**
 * Returns a Router that exposes `GET /openapi.json` (the spec) and `GET /docs`
 * (a Stoplight Elements viewer loaded from CDN). The spec is regenerated on
 * each request, so it always reflects the current dispatcher state.
 */
function openApi(rootRouter: Router, opts: OpenApiOptions): Router {
    const r = new Router({ name: "OpenAPI" })
    const specPath = opts.specPath ?? "/openapi.json"
    const docsPath = opts.docsPath ?? "/docs"

    r.addHandler({
        method: Method.GET,
        path: stripLeadingSlash(specPath),
        function: () => YasswsResponse.json(buildOpenApiSpec(rootRouter, opts)),
    })

    r.addHandler({
        method: Method.GET,
        path: stripLeadingSlash(docsPath),
        function: () => {
            const res = YasswsResponse.html(docsHtml(opts.info.title, specPath))
            // Stoplight Elements (loaded from unpkg) needs scripts, styles,
            // inline styles, and wasm to run. Allow those for *this route only*
            // — globally-installed secureHeaders() preserves these.
            res.setHeader(
                "Content-Security-Policy",
                [
                    "default-src 'self'",
                    "script-src 'self' https://unpkg.com 'unsafe-inline' 'unsafe-eval'",
                    "style-src 'self' https://unpkg.com 'unsafe-inline'",
                    "font-src 'self' https://unpkg.com data:",
                    "img-src 'self' https://unpkg.com data:",
                    "connect-src 'self'",
                ].join("; ")
            )
            res.setHeader("X-Frame-Options", "SAMEORIGIN")
            return res
        },
    })

    return r
}

function stripLeadingSlash(p: string): string {
    return p.startsWith("/") ? p.slice(1) : p
}

function docsHtml(title: string, specUrl: string): string {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)} — docs</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<script src="https://unpkg.com/@stoplight/elements/web-components.min.js"></script>
<link rel="stylesheet" href="https://unpkg.com/@stoplight/elements/styles.min.css" />
<style>html,body,elements-api{height:100%;margin:0;padding:0;}</style>
</head>
<body>
<elements-api apiDescriptionUrl="${escapeHtml(specUrl)}" router="hash" layout="sidebar"></elements-api>
</body>
</html>
`
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) =>
        c === "&" ? "&amp;" :
        c === "<" ? "&lt;" :
        c === ">" ? "&gt;" :
        c === '"' ? "&quot;" : "&#39;"
    )
}
