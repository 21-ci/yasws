import { Method } from "./method.js"
import { Route } from "./router.js"
import type { Filter } from "./filter.js"
import type { Middleware } from "./middleware.js"

export { Controller, Get, Post, Put, Patch, Delete, Options, Head, All, UseFilters, UseMiddleware }

/**
 * Class decorator that sets the default rootPath for a Router subclass.
 *
 *   @Controller("/users")
 *   class UserController extends Router {}
 *
 *   new UserController()  // rootPath = "/users/"
 */
function Controller(rootPath: string) {
    // `any[]` (not `unknown[]`) is required so the decorator accepts any concrete
    // constructor signature (e.g. `new (opts?: RouterOptions)`). With `unknown[]`
    // TS rejects every typed constructor.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return function <T extends new (...args: any[]) => object>(target: T): T {
        ;(target as unknown as { _controllerRootPath: string })._controllerRootPath = rootPath
        return target
    }
}

const make = (method: Method) =>
    (path: string = "/", opts?: { filters?: Filter[]; middlewares?: Middleware[] }) =>
        Route(path, method, opts ?? [])

const Get = make(Method.GET)
const Post = make(Method.POST)
const Put = make(Method.PUT)
const Patch = make(Method.PATCH)
const Delete = make(Method.DELETE)
const Options = make(Method.OPTIONS)
const Head = make(Method.HEAD)
const All = make(Method.ALL)

/**
 * Attach filters to a handler. Order: outer decorators wrap inner, so
 *
 *   @Get("/:id")
 *   @UseFilters(auth)
 *   findOne() {}
 *
 * is read top-down: auth filter runs before the handler.
 */
function UseFilters(...filters: Filter[]) {
    return function (_target: object, _propertyKey: string, descriptor: PropertyDescriptor): PropertyDescriptor {
        const fn = descriptor.value as { _filters?: Filter[] }
        fn._filters = [...filters, ...(fn._filters ?? [])]
        return descriptor
    }
}

function UseMiddleware(...middlewares: Middleware[]) {
    return function (_target: object, _propertyKey: string, descriptor: PropertyDescriptor): PropertyDescriptor {
        const fn = descriptor.value as { _middlewares?: Middleware[] }
        fn._middlewares = [...middlewares, ...(fn._middlewares ?? [])]
        return descriptor
    }
}
