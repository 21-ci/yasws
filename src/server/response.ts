import type { Header } from "./header.js"

export { YasswsResponse, isResponse, toResponse, type HandlerResponse }

interface HandlerResponse {
    statusCode: number
    contentType: string
    data: string | Uint8Array
    headers?: Header[]
}

/**
 * Transport-agnostic HTTP response. Implements HandlerResponse for back-compat
 * with handlers that returned a plain object.
 */
class YasswsResponse implements HandlerResponse {
    public statusCode: number
    public contentType: string
    public data: string | Uint8Array
    public headers: Header[]

    public constructor(opts: { statusCode?: number; contentType?: string; data?: string | Uint8Array; headers?: Header[] } = {}) {
        this.statusCode = opts.statusCode ?? 200
        this.contentType = opts.contentType ?? "text/plain; charset=utf-8"
        this.data = opts.data ?? ""
        this.headers = opts.headers ?? []
    }

    public setHeader(name: string, data: string): this {
        const i = this.headers.findIndex(h => h.name.toLowerCase() === name.toLowerCase())
        if (i >= 0) this.headers[i] = { name, data }
        else this.headers.push({ name, data })
        return this
    }

    public static json(body: unknown, statusCode: number = 200, headers?: Header[]): YasswsResponse {
        return new YasswsResponse({
            statusCode,
            contentType: "application/json; charset=utf-8",
            data: JSON.stringify(body),
            ...(headers ? { headers } : {}),
        })
    }

    public static text(body: string, statusCode: number = 200, headers?: Header[]): YasswsResponse {
        return new YasswsResponse({
            statusCode,
            contentType: "text/plain; charset=utf-8",
            data: body,
            ...(headers ? { headers } : {}),
        })
    }

    public static html(body: string, statusCode: number = 200, headers?: Header[]): YasswsResponse {
        return new YasswsResponse({
            statusCode,
            contentType: "text/html; charset=utf-8",
            data: body,
            ...(headers ? { headers } : {}),
        })
    }

    public static buffer(body: Uint8Array, contentType: string, statusCode: number = 200, headers?: Header[]): YasswsResponse {
        return new YasswsResponse({
            statusCode,
            contentType,
            data: body,
            ...(headers ? { headers } : {}),
        })
    }

    public static empty(statusCode: number = 204): YasswsResponse {
        return new YasswsResponse({ statusCode, contentType: "text/plain; charset=utf-8", data: "" })
    }

    public static redirect(location: string, statusCode: number = 302): YasswsResponse {
        const r = new YasswsResponse({ statusCode, contentType: "text/plain; charset=utf-8", data: "" })
        r.setHeader("Location", location)
        return r
    }
}

function isResponse(r: unknown): r is HandlerResponse {
    return !!r && typeof (r as HandlerResponse).statusCode === "number"
}

function toResponse(r: HandlerResponse | YasswsResponse): YasswsResponse {
    if (r instanceof YasswsResponse) return r
    return new YasswsResponse({
        statusCode: r.statusCode,
        contentType: r.contentType,
        data: r.data,
        headers: r.headers ? [...r.headers] : []
    })
}
