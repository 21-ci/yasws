import type { Logger } from "../logger.js"
import { BadRequestError, PayloadTooLargeError, UnsupportedMediaTypeError } from "./errors.js"
import { lowercaseHeaders } from "./helpers.js"

export { YasswsRequest, type BodyReader, type YasswsRequestInit, type Request }

type BodyReader = (maxBytes: number) => Promise<Uint8Array>

interface YasswsRequestInit {
    method: string
    url: string
    path: string
    headers: Record<string, string | string[] | undefined>
    scheme?: "http" | "https"
    host?: string
    remoteAddress?: string
    bodyReader?: BodyReader
    logger?: Logger
    /** Free-form per-request store for middleware to attach values. */
    args?: Record<string, unknown>
}

/**
 * Transport-agnostic HTTP request. Carries no node:http types so it can be
 * constructed from any source: node:http, wasi:http, in-process test injection.
 */
class YasswsRequest {
    public readonly method: string
    public readonly url: string
    public path: string
    public readonly headers: Record<string, string | string[]>
    public readonly scheme: "http" | "https"
    public readonly host: string
    public readonly remoteAddress: string | undefined
    public readonly query: URLSearchParams
    public params: Record<string, string> = {}
    public args: Record<string, unknown>
    public logger: Logger | undefined

    private readonly bodyReader: BodyReader | undefined
    private cachedBody: Uint8Array | undefined

    public constructor(init: YasswsRequestInit) {
        this.method = init.method.toUpperCase()
        this.url = init.url
        this.path = init.path
        this.headers = lowercaseHeaders(init.headers)
        this.scheme = init.scheme ?? "http"
        const headerHost = this.header("host")
        this.host = init.host ?? headerHost ?? "localhost"
        this.remoteAddress = init.remoteAddress
        const qIdx = init.url.indexOf("?")
        this.query = new URLSearchParams(qIdx >= 0 ? init.url.slice(qIdx + 1) : "")
        this.bodyReader = init.bodyReader
        this.logger = init.logger
        this.args = init.args ?? {}
    }

    /** Case-insensitive single-value header read. Returns first value if header was repeated. */
    public header(name: string): string | undefined {
        const v = this.headers[name.toLowerCase()]
        if (Array.isArray(v)) return v[0]
        return v
    }

    /** All values of a header (always an array). */
    public headerAll(name: string): string[] {
        const v = this.headers[name.toLowerCase()]
        if (v === undefined) return []
        return Array.isArray(v) ? v : [v]
    }

    public get contentType(): string | undefined {
        const v = this.header("content-type")
        if (!v) return undefined
        const semi = v.indexOf(";")
        return (semi >= 0 ? v.slice(0, semi) : v).trim().toLowerCase()
    }

    public get contentLength(): number | undefined {
        const v = this.header("content-length")
        if (v === undefined) return undefined
        const n = Number(v)
        return Number.isFinite(n) ? n : undefined
    }

    /** Read the raw request body. Throws PayloadTooLargeError if larger than maxBytes. */
    public async body(opts: { maxBytes?: number } = {}): Promise<Uint8Array> {
        if (this.cachedBody) return this.cachedBody
        if (!this.bodyReader) return (this.cachedBody = new Uint8Array(0))
        const max = opts.maxBytes ?? 1_048_576
        const cl = this.contentLength
        if (cl !== undefined && cl > max) throw new PayloadTooLargeError()
        this.cachedBody = await this.bodyReader(max)
        return this.cachedBody
    }

    public async text(opts?: { maxBytes?: number }): Promise<string> {
        return new TextDecoder("utf-8").decode(await this.body(opts))
    }

    public async json<T = unknown>(opts?: { maxBytes?: number }): Promise<T> {
        const ct = this.contentType
        if (ct && ct !== "application/json") {
            throw new UnsupportedMediaTypeError(`expected application/json, got ${ct}`)
        }
        const text = await this.text(opts)
        if (!text) throw new BadRequestError("empty body")
        try {
            return JSON.parse(text) as T
        } catch (e) {
            throw new BadRequestError("invalid JSON", { cause: e })
        }
    }

    public async form(opts?: { maxBytes?: number }): Promise<URLSearchParams> {
        return new URLSearchParams(await this.text(opts))
    }
}

/** Back-compat alias for the prior interface name. */
type Request = YasswsRequest
