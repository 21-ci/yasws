/**
 * Transport-agnostic application showcasing the v2 feature set:
 *
 *   - @Controller / @Get / @Post / @Patch / @Delete  — routing
 *   - @Body / @Param / @Query / @Headers              — parameter decorators
 *   - schema validation via .parse() (Zod-compatible)
 *   - @HttpCode / @SetHeader / @Redirect              — response shaping
 *   - @UseExceptionFilters                            — per-handler catch
 *   - @ApiTags / @ApiOperation / @ApiResponse / @ApiBody — OpenAPI docs
 *   - dispatcher.onStart / onShutdown                 — lifecycle hooks
 *   - healthRouter(...)                               — /healthz + /ready
 *   - openApi(app, ...)                               — /openapi.json + /docs
 *
 * Run on Node:   npm run start:node
 * Run on WASI:   npm run serve:wasi
 */

import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Router,
    Dispatcher,
    YasswsResponse,
    NotFoundError,
    Body,
    Param,
    Query,
    HttpCode,
    SetHeader,
    UseExceptionFilters,
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBody,
    secureHeaders,
    cors,
    openApi,
    healthRouter,
    type ExceptionFilter,
    type YasswsRequest,
} from "yasws"

// ─────────────────────────────────────────────────────────────────────────────
// Domain
// ─────────────────────────────────────────────────────────────────────────────

interface User {
    id: string
    name: string
    email: string
    createdAt: string
}

class UserStore {
    private readonly byId = new Map<string, User>()
    private seq = 0

    public list(): User[] {
        return [...this.byId.values()]
    }
    public get(id: string): User | undefined {
        return this.byId.get(id)
    }
    public create(input: { name: string; email: string }): User {
        const id = String(++this.seq)
        const user: User = { id, name: input.name, email: input.email, createdAt: new Date().toISOString() }
        this.byId.set(id, user)
        return user
    }
    public update(id: string, patch: Partial<Pick<User, "name" | "email">>): User | undefined {
        const cur = this.byId.get(id)
        if (!cur) return undefined
        const next: User = { ...cur, ...patch }
        this.byId.set(id, next)
        return next
    }
    public delete(id: string): boolean {
        return this.byId.delete(id)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Schemas (Zod-compatible — anything with `.parse(input)` works)
//
// Replace these hand-rolled schemas with `z.object({...})` if you prefer Zod.
// ─────────────────────────────────────────────────────────────────────────────

const createUserSchema = {
    parse(input: unknown): { name: string; email: string } {
        if (!input || typeof input !== "object") throw new Error("body must be an object")
        const o = input as Record<string, unknown>
        if (typeof o.name !== "string" || o.name.length === 0 || o.name.length > 128) {
            throw new Error("'name' is required, 1..128 chars")
        }
        if (typeof o.email !== "string" || !o.email.includes("@") || o.email.length > 256) {
            throw new Error("'email' must be a valid address")
        }
        return { name: o.name, email: o.email }
    },
}

const updateUserSchema = {
    parse(input: unknown): { name?: string; email?: string } {
        if (!input || typeof input !== "object") throw new Error("body must be an object")
        const o = input as Record<string, unknown>
        const out: { name?: string; email?: string } = {}
        if (o.name !== undefined) {
            if (typeof o.name !== "string" || o.name.length === 0 || o.name.length > 128) {
                throw new Error("'name' must be 1..128 chars")
            }
            out.name = o.name
        }
        if (o.email !== undefined) {
            if (typeof o.email !== "string" || !o.email.includes("@")) {
                throw new Error("'email' must be a valid address")
            }
            out.email = o.email
        }
        return out
    },
}

// JSON Schema fragments for OpenAPI (decoupled from the runtime schemas above)
const userJsonSchema = {
    type: "object",
    required: ["id", "name", "email", "createdAt"],
    properties: {
        id: { type: "string" },
        name: { type: "string" },
        email: { type: "string", format: "email" },
        createdAt: { type: "string", format: "date-time" },
    },
} as const

const createUserBodySchema = {
    type: "object",
    required: ["name", "email"],
    properties: {
        name: { type: "string", minLength: 1, maxLength: 128 },
        email: { type: "string", format: "email" },
    },
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Exception filter: turn the (rare) raw Error from validation into a 422
// instead of the default 400. Demonstrates @UseExceptionFilters.
// ─────────────────────────────────────────────────────────────────────────────

class ValidationProblemFilter implements ExceptionFilter {
    catch(err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.startsWith("validation failed:")) {
            return YasswsResponse.json({ error: "Unprocessable Entity", detail: msg }, 422)
        }
        return undefined
    }
}

const validationFilter = new ValidationProblemFilter()

// ─────────────────────────────────────────────────────────────────────────────
// Controllers
// ─────────────────────────────────────────────────────────────────────────────

@Controller("/users")
@ApiTags("users")
class UsersController extends Router {
    public constructor(private readonly store: UserStore) {
        super()
    }

    @Get("/")
    @ApiOperation({ summary: "List all users", operationId: "listUsers" })
    @ApiResponse({ status: 200, jsonSchema: { type: "array", items: userJsonSchema } })
    async list(@Query("limit") limit: string | undefined) {
        const all = this.store.list()
        const n = limit ? Math.max(0, Math.min(1000, Number(limit) || 0)) : all.length
        return YasswsResponse.json({ users: all.slice(0, n) })
    }

    @Get("/:id")
    @ApiOperation({ summary: "Fetch a user by id", operationId: "getUser" })
    @ApiResponse({ status: 200, jsonSchema: userJsonSchema })
    @ApiResponse({ status: 404 })
    async findOne(@Param("id") id: string) {
        const u = this.store.get(id)
        if (!u) throw new NotFoundError(`no user with id ${id}`)
        return YasswsResponse.json(u)
    }

    @Post("/")
    @HttpCode(201)
    @SetHeader("X-Resource", "user")
    @UseExceptionFilters(validationFilter)
    @ApiOperation({ summary: "Create a user", operationId: "createUser" })
    @ApiBody({ jsonSchema: createUserBodySchema, required: true })
    @ApiResponse({ status: 201, jsonSchema: userJsonSchema })
    @ApiResponse({ status: 422, description: "Validation failed" })
    async create(@Body(createUserSchema) input: { name: string; email: string }) {
        return YasswsResponse.json(this.store.create(input))
    }

    @Patch("/:id")
    @UseExceptionFilters(validationFilter)
    @ApiOperation({ summary: "Update a user", operationId: "updateUser" })
    @ApiResponse({ status: 200, jsonSchema: userJsonSchema })
    @ApiResponse({ status: 404 })
    async update(
        @Param("id") id: string,
        @Body(updateUserSchema) patch: { name?: string; email?: string },
    ) {
        const u = this.store.update(id, patch)
        if (!u) throw new NotFoundError(`no user with id ${id}`)
        return YasswsResponse.json(u)
    }

    @Delete("/:id")
    @HttpCode(204)
    @ApiOperation({ summary: "Delete a user", operationId: "deleteUser" })
    @ApiResponse({ status: 204 })
    @ApiResponse({ status: 404 })
    async remove(@Param("id") id: string) {
        if (!this.store.delete(id)) throw new NotFoundError(`no user with id ${id}`)
        return YasswsResponse.empty(204)
    }
}

@Controller("/")
@ApiTags("meta")
class RootController extends Router {
    @Get("/")
    @ApiOperation({ summary: "Service index" })
    async root(_req: YasswsRequest) {
        return YasswsResponse.json({
            service: "portable-rest",
            docs: "/docs",
            spec: "/openapi.json",
            health: "/healthz",
            ready: "/ready",
        })
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// App wiring
// ─────────────────────────────────────────────────────────────────────────────

export function buildApp(): Dispatcher {
    const app = new Dispatcher({ name: "portable-rest" })

    // Shared, request-scoped store. In production replace with a real DB —
    // remember the WASI guest is request-scoped too (state lives only as long
    // as the host keeps the instance warm).
    const store = new UserStore()

    app.addRouter(new RootController())
    app.addRouter(new UsersController(store))

    app.addRouter(healthRouter({
        liveness: "/healthz",
        readiness: "/ready",
        checks: {
            store: async () => ({ ok: true, users: store.list().length }),
        },
    }))

    app.addRouter(openApi(app, {
        info: { title: "Portable REST API", version: "1.0.0", description: "YASWS v2 demo" },
        servers: [{ url: "http://localhost:8000", description: "node" }, { url: "http://localhost:8080", description: "wasi" }],
    }))

    const corsMw = cors({ origin: "*", methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"] })
    app.addMiddleware(corsMw)
    app.addResponseInterceptor(corsMw.intercept)
    app.addResponseInterceptor(secureHeaders())

    app.onStart(async () => {
        app.logger.info("portable-rest starting; seeding demo user")
        store.create({ name: "Ada", email: "ada@example.com" })
    })
    app.onShutdown(async () => {
        app.logger.info("portable-rest shutting down")
    })

    return app
}
