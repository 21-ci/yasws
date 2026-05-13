import { YasswsRequest, type BodyReader } from "../server/request.js"
import { YasswsResponse } from "../server/response.js"
import type { AppHandler } from "../server/dispatcher.js"
import { PayloadTooLargeError } from "../server/errors.js"
import { addEndSlash } from "../server/helpers.js"

export { YASWSWasiHTTP, yasswsWasiHttpHandle, type WasiHttpBindings, type WasiIncomingRequest, type WasiResponseOutparam }

/**
 * Adapter for the WebAssembly Component Model `wasi:http/incoming-handler@0.2.x`
 * world. This module is transport-only — it converts a WASI incoming request
 * resource into a `YasswsRequest`, invokes the YASWS app handler, and pumps the
 * resulting `YasswsResponse` into the WASI `response-outparam`.
 *
 * USAGE (with jco-compiled JS component):
 *
 *   // 1) Build with: jco componentize app.js --wit wit/world.wit -n handler -o app.wasm
 *   // 2) In your entrypoint:
 *
 *   import * as wasiHttpTypes from "wasi:http/types@0.2.8"
 *   import { Dispatcher, yasswsWasiHttpHandle } from "yasws"
 *
 *   import { MyController } from "./controllers.js"
 *
 *   const app = new Dispatcher()
 *   app.addRouter(new MyController())
 *   const handler = app.toHandler()
 *
 *   export const incomingHandler = {
 *     async handle(request, responseOut) {
 *       await yasswsWasiHttpHandle(handler, request, responseOut, wasiHttpTypes)
 *     }
 *   }
 *
 * The host (wasmtime serve, your custom Rust host using wasmtime-wasi-http,
 * a JS host using jco transpile, …) owns the TCP socket and HTTP parsing.
 * This adapter only crosses the WASM boundary as a function call — never
 * touching `node:http` or `node:net`.
 *
 * Bindings are passed via dependency injection because the actual module
 * names (`wasi:http/types@0.2.8`) are host-resolved at link time and must
 * not be imported statically from a generic library.
 */

// --- Minimal WIT-shaped types (host-provided; structural only) ---

interface WasiFields {
    entries(): Array<[string, Uint8Array]>
    append(name: string, value: Uint8Array): void
}

interface WasiIncomingBody {
    stream(): WasiInputStream
}

interface WasiInputStream {
    blockingRead(len: bigint): Uint8Array
    read?(len: bigint): Uint8Array
    [Symbol.dispose]?(): void
}

interface WasiOutputStream {
    blockingWriteAndFlush(bytes: Uint8Array): void
    checkWrite?(): bigint
    write?(bytes: Uint8Array): void
    blockingFlush?(): void
    [Symbol.dispose]?(): void
}

interface WasiOutgoingBody {
    write(): WasiOutputStream
}

interface WasiOutgoingResponse {
    setStatusCode(code: number): void
    body(): WasiOutgoingBody
}

interface WasiIncomingRequest {
    method(): { tag: string; val?: string }
    pathWithQuery(): string | undefined
    scheme(): { tag: string; val?: string } | undefined
    authority(): string | undefined
    headers(): WasiFields
    consume(): WasiIncomingBody
}

interface WasiResponseOutparam {
    /* opaque host handle */
}

interface WasiHttpBindings {
    Fields: new () => WasiFields
    OutgoingResponse: new (headers: WasiFields) => WasiOutgoingResponse
    OutgoingBody: {
        finish(body: WasiOutgoingBody, trailers?: WasiFields): void
    }
    ResponseOutparam: {
        set(out: WasiResponseOutparam, result: { tag: "ok"; val: WasiOutgoingResponse } | { tag: "err"; val: unknown }): void
    }
}

/**
 * Single-call adapter from a WASI incoming-handler invocation to a YASWS app handler.
 * Use this directly if you're exporting the binding manually.
 */
async function yasswsWasiHttpHandle(
    handler: AppHandler,
    incomingRequest: WasiIncomingRequest,
    responseOut: WasiResponseOutparam,
    bindings: WasiHttpBindings,
    opts: { maxBodyBytes?: number } = {}
): Promise<void> {
    const maxBody = opts.maxBodyBytes ?? 1_048_576

    const ywReq = wasiToYasws(incomingRequest, maxBody)
    let ywRes: YasswsResponse
    try {
        ywRes = await handler(ywReq)
    } catch {
        ywRes = YasswsResponse.json({ error: "Internal Server Error" }, 500)
    }
    writeWasiResponse(ywRes, responseOut, bindings)
}

/**
 * Class wrapper. Pass `bindings` once in the constructor and re-use across requests.
 */
class YASWSWasiHTTP {
    private readonly handler: AppHandler
    private readonly bindings: WasiHttpBindings
    private readonly maxBodyBytes: number
    private readonly lifecycleOwner: { start(): Promise<void> } | undefined
    private startPromise: Promise<void> | undefined

    public constructor(
        handler: AppHandler | { toHandler(): AppHandler; start?: () => Promise<void> },
        bindings: WasiHttpBindings,
        opts: { maxBodyBytes?: number } = {}
    ) {
        if (typeof handler === "function") {
            this.handler = handler
            this.lifecycleOwner = undefined
        } else {
            this.handler = handler.toHandler()
            this.lifecycleOwner = typeof handler.start === "function" ? (handler as { start(): Promise<void> }) : undefined
        }
        this.bindings = bindings
        this.maxBodyBytes = opts.maxBodyBytes ?? 1_048_576
    }

    public async handle(incomingRequest: WasiIncomingRequest, responseOut: WasiResponseOutparam): Promise<void> {
        if (this.lifecycleOwner && !this.startPromise) this.startPromise = this.lifecycleOwner.start()
        if (this.startPromise) await this.startPromise
        await yasswsWasiHttpHandle(this.handler, incomingRequest, responseOut, this.bindings, { maxBodyBytes: this.maxBodyBytes })
    }
}

// --- internals ---

function wasiToYasws(req: WasiIncomingRequest, maxBody: number): YasswsRequest {
    const methodVariant = req.method()
    const method = methodVariant.tag === "other" && methodVariant.val ? methodVariant.val.toUpperCase() : methodVariant.tag.toUpperCase()
    const pathWithQuery = req.pathWithQuery() ?? "/"
    const schemeVariant = req.scheme()
    const scheme: "http" | "https" =
        !schemeVariant ? "http"
            : schemeVariant.tag === "HTTPS" || schemeVariant.tag === "https" ? "https"
            : "http"
    const authority = req.authority() ?? "localhost"
    const path = (() => {
        const i = pathWithQuery.indexOf("?")
        return i >= 0 ? pathWithQuery.slice(0, i) : pathWithQuery
    })()

    const headers: Record<string, string | string[]> = {}
    for (const [name, valueBytes] of req.headers().entries()) {
        const decoded = new TextDecoder("utf-8").decode(valueBytes)
        const key = name.toLowerCase()
        const existing = headers[key]
        if (existing === undefined) headers[key] = decoded
        else if (Array.isArray(existing)) existing.push(decoded)
        else headers[key] = [existing, decoded]
    }

    const bodyReader: BodyReader = (max: number) => readWasiBody(req, Math.min(max, maxBody))

    return new YasswsRequest({
        method,
        url: pathWithQuery,
        path: addEndSlash(path),
        headers,
        scheme,
        host: authority,
        bodyReader,
    })
}

async function readWasiBody(req: WasiIncomingRequest, maxBytes: number): Promise<Uint8Array> {
    const body = req.consume()
    const stream = body.stream()
    const chunks: Uint8Array[] = []
    let total = 0
    const CHUNK = 65_536
    try {
        while (true) {
            const want = Math.min(CHUNK, maxBytes - total + 1)
            let chunk: Uint8Array
            try {
                chunk = stream.blockingRead(BigInt(want))
            } catch (e) {
                // WASI stream-error.closed marks end-of-stream
                const tag = (e as { tag?: string; payload?: { tag?: string } })?.tag ?? (e as { payload?: { tag?: string } })?.payload?.tag
                if (tag === "closed") break
                throw e
            }
            if (chunk.length === 0) break
            total += chunk.length
            if (total > maxBytes) throw new PayloadTooLargeError()
            chunks.push(chunk)
        }
    } finally {
        stream[Symbol.dispose]?.()
    }
    return concatBytes(chunks)
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
    let total = 0
    for (const c of chunks) total += c.byteLength
    const out = new Uint8Array(total)
    let offset = 0
    for (const c of chunks) {
        out.set(c, offset)
        offset += c.byteLength
    }
    return out
}

function writeWasiResponse(r: YasswsResponse, responseOut: WasiResponseOutparam, bindings: WasiHttpBindings): void {
    const fields = new bindings.Fields()
    const enc = new TextEncoder()
    fields.append("content-type", enc.encode(r.contentType))
    const body = typeof r.data === "string" ? enc.encode(r.data) : r.data
    fields.append("content-length", enc.encode(String(body.byteLength)))
    for (const h of r.headers) fields.append(h.name.toLowerCase(), enc.encode(h.data))

    const outResp = new bindings.OutgoingResponse(fields)
    outResp.setStatusCode(r.statusCode)
    const outBody = outResp.body()
    bindings.ResponseOutparam.set(responseOut, { tag: "ok", val: outResp })

    const outStream = outBody.write()
    try {
        let offset = 0
        const CHUNK = 4096
        while (offset < body.byteLength) {
            const slice = body.subarray(offset, Math.min(offset + CHUNK, body.byteLength))
            outStream.blockingWriteAndFlush(new Uint8Array(slice.buffer, slice.byteOffset, slice.byteLength))
            offset += slice.byteLength
        }
    } finally {
        outStream[Symbol.dispose]?.()
    }
    bindings.OutgoingBody.finish(outBody)
}
