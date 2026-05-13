/**
 * Method decorators that shape the response after the handler returns:
 *
 *   @HttpCode(204)            — override default 200
 *   @SetHeader("X-Powered-By", "yasws")
 *   @Redirect("/login", 302)  — redirect (handler return value ignored if it's not a response)
 */

import { getOrInitMeta } from "./metadata.js"

export { HttpCode, SetHeader, Redirect }

function HttpCode(code: number) {
    return function (_target: object, _propertyKey: string | symbol, descriptor: PropertyDescriptor): PropertyDescriptor {
        const fn = descriptor.value as object
        getOrInitMeta(fn).httpCode = code
        return descriptor
    }
}

function SetHeader(name: string, value: string) {
    return function (_target: object, _propertyKey: string | symbol, descriptor: PropertyDescriptor): PropertyDescriptor {
        const fn = descriptor.value as object
        const meta = getOrInitMeta(fn)
        if (!meta.setHeaders) meta.setHeaders = []
        meta.setHeaders.push({ name, value })
        return descriptor
    }
}

function Redirect(location: string, statusCode: number = 302) {
    return function (_target: object, _propertyKey: string | symbol, descriptor: PropertyDescriptor): PropertyDescriptor {
        const fn = descriptor.value as object
        getOrInitMeta(fn).redirect = { location, statusCode }
        return descriptor
    }
}
