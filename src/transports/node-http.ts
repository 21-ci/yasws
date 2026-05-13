import http from "node:http"
import https from "node:https"
import type { AddressInfo } from "node:net"

import { YasswsRequest, type BodyReader } from "../server/request.js"
import { YasswsResponse } from "../server/response.js"
import type { Dispatcher, AppHandler } from "../server/dispatcher.js"
import { PayloadTooLargeError, BadRequestError, HttpError } from "../server/errors.js"
import { addEndSlash } from "../server/helpers.js"
import { defaultLogger, type Logger } from "../logger.js"

export { YASWSNodeHTTP, type YASWSNodeHTTPOptions, type Limits }

interface Limits {
    /** Max request body bytes accepted before responding 413. Default 1 MB. */
    maxBodyBytes?: number
    /** Time the server waits for HTTP headers before destroying the socket. Default 60 s. */
    headersTimeoutMs?: number
    /** Total request lifetime before timeout. Default 30 s. */
    requestTimeoutMs?: number
    /** Idle keep-alive timeout. Default 5 s. */
    keepAliveTimeoutMs?: number
    /** Cap on header lines. Default 100. */
    maxHeadersCount?: number
}

interface YASWSNodeHTTPOptions {
    port?: number
    host?: string
    /** Provide to enable HTTPS. */
    tls?: {
        key: string | Buffer
        cert: string | Buffer
        ca?: string | Buffer | Array<string | Buffer>
    }
    limits?: Limits
    /** If non-empty, requests whose Host header is not in this list are rejected with 400. */
    trustedHosts?: string[]
    logger?: Logger
    /** Time given to in-flight requests to finish during graceful shutdown. Default 30 s. */
    drainTimeoutMs?: number
    /** Install SIGINT + SIGTERM handlers that call close(). Default true. */
    handleSignals?: boolean
}

/**
 * node:http transport for YASWS. Wraps a dispatcher or app handler with an
 * actual HTTP/1.1 (or HTTPS) listener and enforces a security baseline:
 *
 *   - body-size limit (default 1 MB) with streaming guard
 *   - server-side timeouts (headers / request / keep-alive)
 *   - byte-correct Content-Length
 *   - graceful shutdown with drain timeout
 *   - optional Host-header allow-list
 *
 * It does NOT add security response headers — register
 * `SecureHeadersMiddleware` on your Dispatcher for that.
 */
class YASWSNodeHTTP {
    private readonly handler: AppHandler
    private readonly dispatcher: Dispatcher | undefined
    private readonly opts: YASWSNodeHTTPOptions
    private readonly logger: Logger
    private server: http.Server | null = null
    private readonly activeResponses = new Set<http.ServerResponse>()
    private signalHandlers: { sig: NodeJS.Signals; fn: () => void }[] = []

    public constructor(handlerOrDispatcher: AppHandler | Dispatcher, opts: YASWSNodeHTTPOptions = {}) {
        if (typeof handlerOrDispatcher === "function") {
            this.handler = handlerOrDispatcher
            this.dispatcher = undefined
        } else {
            this.handler = handlerOrDispatcher.toHandler()
            this.dispatcher = handlerOrDispatcher
        }
        this.opts = opts
        this.logger = opts.logger ?? defaultLogger
    }

    public async listen(): Promise<{ port: number; host: string }> {
        if (this.server) throw new Error("listen() called twice")

        if (this.dispatcher) await this.dispatcher.start()

        const port = this.opts.port ?? 8000
        const host = this.opts.host ?? "localhost"
        const limits = this.opts.limits ?? {}

        const onRequest = (req: http.IncomingMessage, res: http.ServerResponse): void => {
            this.activeResponses.add(res)
            res.on("close", () => this.activeResponses.delete(res))
            this.handleRequest(req, res).catch((err) => {
                this.logger.error("transport-level error", String((err as Error)?.stack ?? err))
                if (!res.headersSent) {
                    res.statusCode = 500
                    res.setHeader("Content-Type", "application/json; charset=utf-8")
                    res.end(JSON.stringify({ error: "Internal Server Error" }))
                } else {
                    res.destroy()
                }
            })
        }

        const server: http.Server = this.opts.tls
            ? (https.createServer(this.opts.tls, onRequest) as unknown as http.Server)
            : http.createServer(onRequest)

        server.headersTimeout = limits.headersTimeoutMs ?? 60_000
        server.requestTimeout = limits.requestTimeoutMs ?? 30_000
        server.keepAliveTimeout = limits.keepAliveTimeoutMs ?? 5_000
        server.maxHeadersCount = limits.maxHeadersCount ?? 100

        this.server = server

        await new Promise<void>((resolve, reject) => {
            const onErr = (e: Error) => reject(e)
            server.once("error", onErr)
            server.listen({ port, host }, () => {
                server.off("error", onErr)
                resolve()
            })
        })

        const addr = server.address() as AddressInfo | null
        const boundPort = addr?.port ?? port
        const scheme = this.opts.tls ? "https" : "http"
        this.logger.info(`YASWS listening on ${scheme}://${host}:${boundPort}`)

        if (this.opts.handleSignals !== false) this.installSignals()
        return { port: boundPort, host }
    }

    private installSignals(): void {
        const sigs: NodeJS.Signals[] = ["SIGINT", "SIGTERM"]
        for (const sig of sigs) {
            const fn = (): void => {
                this.logger.info(`${sig} received; starting graceful shutdown`)
                this.close().catch((e) => this.logger.error("shutdown failed", String(e)))
            }
            process.once(sig, fn)
            this.signalHandlers.push({ sig, fn })
        }
    }

    public async close(): Promise<void> {
        const server = this.server
        if (!server) return
        const drainMs = this.opts.drainTimeoutMs ?? 30_000

        server.close()
        const timer = setTimeout(() => {
            if (this.activeResponses.size > 0) {
                this.logger.warning(`drain timeout (${drainMs}ms); destroying ${this.activeResponses.size} in-flight connection(s)`)
                for (const r of this.activeResponses) r.destroy()
            }
        }, drainMs)
        timer.unref?.()

        await new Promise<void>((resolve) => {
            server.once("close", () => {
                clearTimeout(timer)
                resolve()
            })
        })

        for (const { sig, fn } of this.signalHandlers) process.off(sig, fn)
        this.signalHandlers = []
        this.server = null

        if (this.dispatcher) await this.dispatcher.shutdown()
        this.logger.info("YASWS stopped")
    }

    private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        const maxBody = this.opts.limits?.maxBodyBytes ?? 1_048_576
        let ywReq: YasswsRequest
        try {
            ywReq = this.toYasws(req, maxBody)
        } catch (err) {
            this.sendError(res, err)
            return
        }

        const ywRes = await this.handler(ywReq)
        this.sendResponse(res, ywRes)
    }

    private toYasws(req: http.IncomingMessage, maxBody: number): YasswsRequest {
        const rawHost = req.headers.host ?? "localhost"
        const trusted = this.opts.trustedHosts
        if (trusted && trusted.length > 0 && !trusted.includes(rawHost)) {
            throw new BadRequestError(`untrusted Host header: ${rawHost}`)
        }

        const url = req.url ?? "/"
        const parsed = (() => {
            try { return new URL(url, `http://${rawHost}`) }
            catch { throw new BadRequestError(`invalid request URL: ${url}`) }
        })()
        const path = addEndSlash(parsed.pathname)

        const bodyReader: BodyReader = (max: number) => readNodeBody(req, Math.min(max, maxBody))

        return new YasswsRequest({
            method: req.method ?? "GET",
            url,
            path,
            headers: req.headers as Record<string, string | string[] | undefined>,
            scheme: "http",
            host: rawHost,
            ...(req.socket.remoteAddress !== undefined ? { remoteAddress: req.socket.remoteAddress } : {}),
            bodyReader,
            logger: this.logger,
        })
    }

    private sendError(res: http.ServerResponse, err: unknown): void {
        const status = err instanceof HttpError ? err.statusCode : 500
        const body =
            err instanceof HttpError && err.expose
                ? { error: err.message }
                : { error: status === 500 ? "Internal Server Error" : "Bad Request" }
        const payload = Buffer.from(JSON.stringify(body), "utf8")
        if (!res.headersSent) {
            res.statusCode = status
            res.setHeader("Content-Type", "application/json; charset=utf-8")
            res.setHeader("Content-Length", payload.byteLength)
            res.setHeader("Date", new Date().toUTCString())
        }
        res.end(payload)
    }

    private sendResponse(res: http.ServerResponse, r: YasswsResponse): void {
        if (res.headersSent) return
        res.statusCode = r.statusCode
        const body = typeof r.data === "string" ? Buffer.from(r.data, "utf8") : r.data
        res.setHeader("Content-Type", r.contentType)
        res.setHeader("Content-Length", body.byteLength)
        res.setHeader("Date", new Date().toUTCString())
        for (const h of r.headers) {
            res.setHeader(h.name, h.data)
        }
        res.end(body)
    }
}

function readNodeBody(req: http.IncomingMessage, maxBytes: number): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
        const cl = req.headers["content-length"]
        if (cl !== undefined) {
            const n = Number(cl)
            if (Number.isFinite(n) && n > maxBytes) {
                req.resume()
                reject(new PayloadTooLargeError())
                return
            }
        }
        const chunks: Buffer[] = []
        let bytes = 0
        let settled = false
        const done = (val: Buffer | Error) => {
            if (settled) return
            settled = true
            if (val instanceof Error) reject(val)
            else resolve(val)
        }
        req.on("data", (c: Buffer) => {
            bytes += c.length
            if (bytes > maxBytes) {
                req.destroy()
                done(new PayloadTooLargeError())
                return
            }
            chunks.push(c)
        })
        req.on("end", () => done(Buffer.concat(chunks)))
        req.on("error", done)
        req.on("aborted", () => done(new BadRequestError("client aborted")))
    })
}
