// Core
export { Dispatcher } from "./server/dispatcher.js"
export type { DispatcherOptions, AppHandler, ErrorHook, NotFoundHook } from "./server/dispatcher.js"

export { Router, Route, UNHANDLED } from "./server/router.js"
export type { RouterOptions, ResponseInterceptor } from "./server/router.js"

export { Controller, Get, Post, Put, Patch, Delete, Options, Head, All, UseFilters, UseMiddleware } from "./server/decorators.js"

// Parameter decorators (Nest-style)
export { Body, Query, Param, Headers, Req, RequestParam } from "./server/param-decorators.js"

// Method response decorators
export { HttpCode, SetHeader, Redirect } from "./server/method-decorators.js"

// Exception filters
export { UseExceptionFilters } from "./server/exception-filter.js"
export type { ExceptionFilter } from "./server/exception-filter.js"

// Lifecycle
export type { LifecycleHook } from "./server/lifecycle.js"

export { YasswsRequest } from "./server/request.js"
export type { BodyReader, YasswsRequestInit, Request } from "./server/request.js"

export { YasswsResponse, isResponse, toResponse } from "./server/response.js"
export type { HandlerResponse } from "./server/response.js"

export { Method, isMethod, normalizeMethod } from "./server/method.js"
export type { Filter } from "./server/filter.js"
export type { Middleware, MiddlewareResult } from "./server/middleware.js"
export type { Handler, HandlerFunction, HandlerSpec } from "./server/handler.js"
export type { Header, RawHeaders } from "./server/header.js"

export {
    HttpError,
    BadRequestError,
    UnauthorizedError,
    ForbiddenError,
    NotFoundError,
    MethodNotAllowedError,
    PayloadTooLargeError,
    UnsupportedMediaTypeError,
    InternalServerError,
} from "./server/errors.js"

// Transports
export { YASWSNodeHTTP } from "./transports/node-http.js"
export type { YASWSNodeHTTPOptions, Limits } from "./transports/node-http.js"

export { YASWSWasiHTTP, yasswsWasiHttpHandle } from "./transports/wasi-http.js"
export type {
    WasiHttpBindings,
    WasiIncomingRequest,
    WasiResponseOutparam,
} from "./transports/wasi-http.js"

// Security
export { SecureHeaders, secureHeaders } from "./security/secure-headers.js"
export type { SecureHeadersOptions } from "./security/secure-headers.js"
export { CorsMiddleware, cors } from "./security/cors.js"
export type { CorsOptions } from "./security/cors.js"
export { RateLimit, rateLimit } from "./security/rate-limit.js"
export type { RateLimitOptions, RateLimitKeyFn } from "./security/rate-limit.js"

// OpenAPI
export { buildOpenApiSpec, openApi } from "./openapi/generator.js"
export type { OpenApiInfo, OpenApiOptions } from "./openapi/generator.js"
export {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBody,
    ApiQuery,
    ApiParam,
    ApiHeader,
    ApiBearerAuth,
    ApiDeprecated,
} from "./openapi/decorators.js"

// Health
export { healthRouter } from "./health/health.js"
export type { HealthCheckFn, HealthOptions } from "./health/health.js"

// Logger
export { Logger, defaultLogger, LogLevel, LogMode, LoggerMiddleware } from "./logger.js"

// Helpers
import * as helpers from "./server/helpers.js"
export { helpers }
