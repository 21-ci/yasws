export { HttpError, BadRequestError, UnauthorizedError, ForbiddenError, NotFoundError, MethodNotAllowedError, PayloadTooLargeError, UnsupportedMediaTypeError, InternalServerError }

class HttpError extends Error {
    public readonly statusCode: number
    public readonly expose: boolean
    public readonly details?: unknown

    constructor(statusCode: number, message?: string, opts: { expose?: boolean; cause?: unknown; details?: unknown } = {}) {
        super(message ?? `HTTP ${statusCode}`)
        this.name = "HttpError"
        this.statusCode = statusCode
        this.expose = opts.expose ?? statusCode < 500
        if (opts.cause !== undefined) (this as unknown as { cause: unknown }).cause = opts.cause
        if (opts.details !== undefined) this.details = opts.details
    }
}

class BadRequestError extends HttpError {
    constructor(message: string = "Bad Request", opts: { cause?: unknown; details?: unknown } = {}) {
        super(400, message, opts)
        this.name = "BadRequestError"
    }
}

class UnauthorizedError extends HttpError {
    constructor(message: string = "Unauthorized", opts: { cause?: unknown } = {}) {
        super(401, message, opts)
        this.name = "UnauthorizedError"
    }
}

class ForbiddenError extends HttpError {
    constructor(message: string = "Forbidden", opts: { cause?: unknown } = {}) {
        super(403, message, opts)
        this.name = "ForbiddenError"
    }
}

class NotFoundError extends HttpError {
    constructor(message: string = "Not Found") {
        super(404, message)
        this.name = "NotFoundError"
    }
}

class MethodNotAllowedError extends HttpError {
    constructor(message: string = "Method Not Allowed") {
        super(405, message)
        this.name = "MethodNotAllowedError"
    }
}

class PayloadTooLargeError extends HttpError {
    constructor(message: string = "Payload Too Large") {
        super(413, message)
        this.name = "PayloadTooLargeError"
    }
}

class UnsupportedMediaTypeError extends HttpError {
    constructor(message: string = "Unsupported Media Type") {
        super(415, message)
        this.name = "UnsupportedMediaTypeError"
    }
}

class InternalServerError extends HttpError {
    constructor(message: string = "Internal Server Error", opts: { cause?: unknown } = {}) {
        super(500, message, { ...opts, expose: false })
        this.name = "InternalServerError"
    }
}
