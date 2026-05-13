import type { YasswsRequest } from "../server/request.js"
import type { YasswsResponse } from "../server/response.js"
import type { ResponseInterceptor } from "../server/router.js"

export { SecureHeaders, secureHeaders, type SecureHeadersOptions }

interface SecureHeadersOptions {
    /** Strict-Transport-Security. Pass false to disable. */
    hsts?: false | { maxAge?: number; includeSubDomains?: boolean; preload?: boolean }
    /** X-Frame-Options. "DENY" | "SAMEORIGIN" | false to disable. Default "DENY". */
    frameOptions?: "DENY" | "SAMEORIGIN" | false
    /** X-Content-Type-Options. Default "nosniff". */
    contentTypeOptions?: boolean
    /** Referrer-Policy. Default "no-referrer". */
    referrerPolicy?: string | false
    /** Content-Security-Policy. Default "default-src 'self'". Pass false to disable. */
    contentSecurityPolicy?: string | false
    /** Cross-Origin-Opener-Policy. Default "same-origin". */
    crossOriginOpenerPolicy?: string | false
    /** Cross-Origin-Resource-Policy. Default "same-origin". */
    crossOriginResourcePolicy?: string | false
    /** X-DNS-Prefetch-Control. Default "off". */
    dnsPrefetchControl?: "on" | "off" | false
    /** X-Permitted-Cross-Domain-Policies. Default "none". */
    permittedCrossDomainPolicies?: string | false
    /** Remove X-Powered-By (always done). */
}

/**
 * Helmet-equivalent security headers. Apply as a response interceptor:
 *
 *   const headers = new SecureHeaders()
 *   dispatcher.addResponseInterceptor(headers.intercept)
 *
 * Or use the helper:
 *
 *   dispatcher.addResponseInterceptor(secureHeaders())
 */
class SecureHeaders {
    private readonly opts: SecureHeadersOptions

    public constructor(opts: SecureHeadersOptions = {}) {
        this.opts = opts
    }

    public intercept = (request: YasswsRequest, response: YasswsResponse): YasswsResponse => {
        const o = this.opts
        const setIfAbsent = (name: string, value: string) => {
            if (!response.headers.some(h => h.name.toLowerCase() === name.toLowerCase())) {
                response.setHeader(name, value)
            }
        }

        if (o.contentTypeOptions !== false) setIfAbsent("X-Content-Type-Options", "nosniff")
        if (o.frameOptions !== false) setIfAbsent("X-Frame-Options", o.frameOptions ?? "DENY")
        if (o.referrerPolicy !== false) setIfAbsent("Referrer-Policy", o.referrerPolicy ?? "no-referrer")
        if (o.contentSecurityPolicy !== false) {
            setIfAbsent("Content-Security-Policy", o.contentSecurityPolicy ?? "default-src 'self'")
        }
        if (o.crossOriginOpenerPolicy !== false) {
            setIfAbsent("Cross-Origin-Opener-Policy", o.crossOriginOpenerPolicy ?? "same-origin")
        }
        if (o.crossOriginResourcePolicy !== false) {
            setIfAbsent("Cross-Origin-Resource-Policy", o.crossOriginResourcePolicy ?? "same-origin")
        }
        if (o.dnsPrefetchControl !== false) setIfAbsent("X-DNS-Prefetch-Control", o.dnsPrefetchControl ?? "off")
        if (o.permittedCrossDomainPolicies !== false) {
            setIfAbsent("X-Permitted-Cross-Domain-Policies", o.permittedCrossDomainPolicies ?? "none")
        }

        if (o.hsts !== false && request.scheme === "https") {
            const h = o.hsts ?? {}
            const maxAge = h.maxAge ?? 15_552_000
            let value = `max-age=${maxAge}`
            if (h.includeSubDomains ?? true) value += "; includeSubDomains"
            if (h.preload) value += "; preload"
            setIfAbsent("Strict-Transport-Security", value)
        }

        return response
    }
}

function secureHeaders(opts: SecureHeadersOptions = {}): ResponseInterceptor {
    return new SecureHeaders(opts).intercept
}
