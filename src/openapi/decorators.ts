/**
 * OpenAPI metadata decorators. Pure documentation — they do not affect runtime
 * behaviour; they only feed the spec generator in `generator.ts`.
 *
 *   @Controller("/users")
 *   @ApiTags("users")
 *   class UsersController extends Router {
 *     @Get("/:id")
 *     @ApiOperation({ summary: "Fetch a user by id" })
 *     @ApiResponse({ status: 200, jsonSchema: userSchema })
 *     @ApiResponse({ status: 404, description: "Not found" })
 *     findOne(@Param("id") id: string) { ... }
 *   }
 */

import { getOrInitMeta } from "../server/metadata.js"

export {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBody,
    ApiQuery,
    ApiParam,
    ApiHeader,
    ApiBearerAuth,
    ApiDeprecated,
    CONTROLLER_API_TAGS,
    CONTROLLER_API_AUTH,
}

const CONTROLLER_API_TAGS = Symbol("yasws.openapi.controllerTags")
const CONTROLLER_API_AUTH = Symbol("yasws.openapi.controllerBearerAuth")

/** Method or class decorator. On a method, tags apply only there. On a class, all methods inherit them. */
function ApiTags(...tags: string[]): ClassDecorator & MethodDecorator {
    const decorator = function (target: object, _propertyKey?: string | symbol, descriptor?: PropertyDescriptor): PropertyDescriptor | void {
        if (descriptor) {
            const fn = descriptor.value as object
            const meta = getOrInitMeta(fn)
            if (!meta.openapi) meta.openapi = {}
            meta.openapi.tags = [...(meta.openapi.tags ?? []), ...tags]
            return descriptor
        }
        ;(target as unknown as Record<symbol, unknown>)[CONTROLLER_API_TAGS] = tags
    }
    return decorator as unknown as ClassDecorator & MethodDecorator
}

function ApiOperation(opts: { summary?: string; description?: string; operationId?: string }) {
    return function (_target: object, _propertyKey: string | symbol, descriptor: PropertyDescriptor): PropertyDescriptor {
        const meta = getOrInitMeta(descriptor.value as object)
        if (!meta.openapi) meta.openapi = {}
        if (opts.summary) meta.openapi.summary = opts.summary
        if (opts.description) meta.openapi.description = opts.description
        if (opts.operationId) meta.openapi.operationId = opts.operationId
        return descriptor
    }
}

function ApiResponse(opts: { status: number; description?: string; jsonSchema?: unknown; contentType?: string }) {
    return function (_target: object, _propertyKey: string | symbol, descriptor: PropertyDescriptor): PropertyDescriptor {
        const meta = getOrInitMeta(descriptor.value as object)
        if (!meta.openapi) meta.openapi = {}
        if (!meta.openapi.responses) meta.openapi.responses = []
        meta.openapi.responses.push({
            status: opts.status,
            ...(opts.description ? { description: opts.description } : {}),
            ...(opts.jsonSchema !== undefined ? { jsonSchema: opts.jsonSchema } : {}),
            ...(opts.contentType ? { contentType: opts.contentType } : {}),
        })
        return descriptor
    }
}

function ApiBody(opts: { jsonSchema?: unknown; required?: boolean; contentType?: string; description?: string }) {
    return function (_target: object, _propertyKey: string | symbol, descriptor: PropertyDescriptor): PropertyDescriptor {
        const meta = getOrInitMeta(descriptor.value as object)
        if (!meta.openapi) meta.openapi = {}
        meta.openapi.requestBody = {
            ...(opts.jsonSchema !== undefined ? { jsonSchema: opts.jsonSchema } : {}),
            ...(opts.required !== undefined ? { required: opts.required } : {}),
            ...(opts.contentType ? { contentType: opts.contentType } : {}),
            ...(opts.description ? { description: opts.description } : {}),
        }
        return descriptor
    }
}

function pushParameter(
    descriptor: PropertyDescriptor,
    p: { in: "query" | "path" | "header"; name: string; required?: boolean; jsonSchema?: unknown; description?: string },
): void {
    const meta = getOrInitMeta(descriptor.value as object)
    if (!meta.openapi) meta.openapi = {}
    if (!meta.openapi.extraParameters) meta.openapi.extraParameters = []
    meta.openapi.extraParameters.push(p)
}

function ApiQuery(opts: { name: string; required?: boolean; jsonSchema?: unknown; description?: string }) {
    return function (_t: object, _k: string | symbol, descriptor: PropertyDescriptor): PropertyDescriptor {
        pushParameter(descriptor, { in: "query", ...opts })
        return descriptor
    }
}

function ApiParam(opts: { name: string; required?: boolean; jsonSchema?: unknown; description?: string }) {
    return function (_t: object, _k: string | symbol, descriptor: PropertyDescriptor): PropertyDescriptor {
        pushParameter(descriptor, { in: "path", required: true, ...opts })
        return descriptor
    }
}

function ApiHeader(opts: { name: string; required?: boolean; jsonSchema?: unknown; description?: string }) {
    return function (_t: object, _k: string | symbol, descriptor: PropertyDescriptor): PropertyDescriptor {
        pushParameter(descriptor, { in: "header", ...opts })
        return descriptor
    }
}

/** Method or class decorator: marks the operation(s) as requiring bearer auth in the generated spec. */
function ApiBearerAuth(): ClassDecorator & MethodDecorator {
    const decorator = function (target: object, _propertyKey?: string | symbol, descriptor?: PropertyDescriptor): PropertyDescriptor | void {
        if (descriptor) {
            const meta = getOrInitMeta(descriptor.value as object)
            if (!meta.openapi) meta.openapi = {}
            meta.openapi.bearerAuth = true
            return descriptor
        }
        ;(target as unknown as Record<symbol, unknown>)[CONTROLLER_API_AUTH] = true
    }
    return decorator as unknown as ClassDecorator & MethodDecorator
}

function ApiDeprecated() {
    return function (_t: object, _k: string | symbol, descriptor: PropertyDescriptor): PropertyDescriptor {
        const meta = getOrInitMeta(descriptor.value as object)
        if (!meta.openapi) meta.openapi = {}
        meta.openapi.deprecated = true
        return descriptor
    }
}
