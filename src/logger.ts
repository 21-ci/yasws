import type { FileHandle } from "node:fs/promises"

import type { Middleware } from "./server/middleware.js"
import type { YasswsRequest } from "./server/request.js"

export { Logger, defaultLogger, LogLevel, LogMode, LoggerMiddleware }

// Built at runtime so static bundlers (esbuild, componentize-js) don't try to
// resolve `node:fs/promises` at bundle/link time. The module is only loaded
// when the user explicitly asks for a log file — letting yasws bundle cleanly
// for WASI components, which have no fs module.
const FS_MODULE_SPECIFIER = ["node:", "fs/promises"].join("")
let fsPromisesModule: typeof import("node:fs/promises") | undefined
async function loadFsPromises(): Promise<typeof import("node:fs/promises")> {
    if (!fsPromisesModule) {
        fsPromisesModule = (await import(FS_MODULE_SPECIFIER)) as typeof import("node:fs/promises")
    }
    return fsPromisesModule
}

enum LogMode {
    PROD = "PROD",
    DEV = "DEBUG",
}

enum LogLevel {
    ERROR = "ERROR",
    INFO = "INFO",
    WARNING = "WARNING",
    DEBUG = "DEBUG",
}

enum LogColor {
    ERROR = "31",
    INFO = "32",
    WARNING = "33",
    DEBUG = "34",
}

class Logger {
    public logLevel: LogLevel[] = []
    public logFilePath: FileHandle | undefined
    public useColor: boolean = true

    private writeQueue: Promise<void> = Promise.resolve()

    public async config(logLevel?: LogLevel[], logFilePath?: string, useColor: boolean = true): Promise<void> {
        if (logLevel) this.logLevel = logLevel
        if (logFilePath) {
            const fs = await loadFsPromises()
            this.logFilePath = await fs.open(logFilePath, "a")
        }
        this.useColor = useColor
    }

    public async setMode(logMode: LogMode = LogMode.DEV): Promise<void> {
        if (logMode === LogMode.PROD) {
            await this.config([LogLevel.INFO, LogLevel.ERROR, LogLevel.WARNING])
        } else {
            await this.config([LogLevel.INFO, LogLevel.DEBUG, LogLevel.ERROR, LogLevel.WARNING])
        }
    }

    private printWrite(message: string): void {
        console.log(message)
        if (!this.logFilePath) return
        const fh = this.logFilePath
        this.writeQueue = this.writeQueue.then(
            () =>
                fh
                    .write(`${message}\n`)
                    .then(() => undefined)
                    .catch((err) => {
                        console.error(`yasws logger write failed: ${String(err)}`)
                    })
        )
    }

    private colorMessage(level: LogLevel, message: string): string {
        const c = LogColor[level]
        return `[${c}m${message}[0m`
    }

    private formatMessage(level: LogLevel, message: string): string {
        const date: string = new Date().toISOString()
        const colored = this.useColor ? this.colorMessage(level, message) : message
        return `[${level}] [${date}] ${colored}`
    }

    public info(message: string): void {
        if (this.logLevel.includes(LogLevel.INFO)) this.printWrite(this.formatMessage(LogLevel.INFO, message))
    }
    public warning(message: string): void {
        if (this.logLevel.includes(LogLevel.WARNING)) this.printWrite(this.formatMessage(LogLevel.WARNING, message))
    }
    public error(message: string, error?: string): void {
        if (!this.logLevel.includes(LogLevel.ERROR)) return
        this.printWrite(this.formatMessage(LogLevel.ERROR, message))
        if (error) this.printWrite(error)
    }
    public debug(message: string): void {
        if (this.logLevel.includes(LogLevel.DEBUG)) this.printWrite(this.formatMessage(LogLevel.DEBUG, message))
    }

    /** Awaitable flush of pending log file writes. */
    public async flush(): Promise<void> {
        await this.writeQueue
    }
}

const defaultLogger: Logger = new Logger()
defaultLogger.setMode(LogMode.DEV)

/**
 * Optional middleware that attaches a Logger to request.args.logger for handlers
 * that explicitly read it that way. v2 also exposes `request.logger` directly on
 * every dispatched request, so this is rarely needed.
 */
class LoggerMiddleware implements Middleware {
    private readonly logger: Logger

    public constructor(logger: Logger = defaultLogger) {
        this.logger = logger
    }

    public call(request: YasswsRequest): YasswsRequest {
        request.args.logger = this.logger
        request.logger = this.logger
        return request
    }
}
