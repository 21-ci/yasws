/**
 * Per-handler exception filters — Nest-style `@UseExceptionFilters(MyFilter)`.
 *
 * If a handler throws, each filter's `catch(error, request)` is invoked in
 * order. The first filter to return a YasswsResponse short-circuits. If no
 * filter responds, the error propagates to the Dispatcher's global error hook.
 *
 *   class NotFoundFilter implements ExceptionFilter {
 *     catch(err, req) {
 *       if (err instanceof NotFoundError) return YasswsResponse.html("<h1>404</h1>", 404)
 *     }
 *   }
 *
 *   @Get("/:id")
 *   @UseExceptionFilters(new NotFoundFilter())
 *   findOne(@Param("id") id: string) { ... }
 */

import { getOrInitMeta } from "./metadata.js"
import type { YasswsRequest } from "./request.js"
import type { YasswsResponse } from "./response.js"

export { UseExceptionFilters, type ExceptionFilter }

interface ExceptionFilter {
    catch(error: unknown, request: YasswsRequest): YasswsResponse | undefined | Promise<YasswsResponse | undefined>
}

function UseExceptionFilters(...filters: ExceptionFilter[]) {
    return function (_target: object, _propertyKey: string | symbol, descriptor: PropertyDescriptor): PropertyDescriptor {
        const fn = descriptor.value as object
        const meta = getOrInitMeta(fn)
        if (!meta.exceptionFilters) meta.exceptionFilters = []
        meta.exceptionFilters.push(...filters)
        return descriptor
    }
}
