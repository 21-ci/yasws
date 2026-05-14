/**
 * App composition root.
 *
 *   Dispatcher
 *   ├── UiController         "/"            (HTML, Prism-rendered SQL)
 *   ├── Router "/api"
 *   │   ├── SnippetsController   "/snippets"
 *   │   └── LanguagesController  "/languages"
 *   ├── healthRouter()       "/healthz", "/ready"
 *   └── openApi()            "/openapi.json", "/docs"
 *
 * Pure — no `process.env`, no `node:*`. The libsql client URL is passed in
 * by the transport entry (`node.ts` or `wasi.ts`).
 */

import { Dispatcher, Router, cors, secureHeaders, healthRouter, openApi, LoggerMiddleware } from "yasws"

import { createDb, initSchema, type Client } from "./infra/db.js"
import { seedDemoSnippets } from "./infra/seed.js"
import { SnippetStore } from "./domain/snippet-store.js"
import { SnippetsController } from "./modules/snippets/snippets.controller.js"
import { LanguagesController } from "./modules/languages/languages.controller.js"
import { UiController } from "./modules/ui/ui.controller.js"
import { TraceMiddleware } from "./shared/trace.middleware.js"

export interface BuildOptions {
    dbUrl: string
    dbAuthToken?: string
}

export function buildApp(opts: BuildOptions) {
    const app = new Dispatcher({ name: "sql-snippets" })
    const db: Client = createDb(opts.dbUrl, opts.dbAuthToken)
    const store = new SnippetStore(db)

    const api = new Router({ name: "ApiRoot", rootPath: "/api" })
    api.addRouter(new SnippetsController(store))
    api.addRouter(new LanguagesController(store))

    app.addRouter(new UiController(store))
    app.addRouter(api)

    app.addRouter(healthRouter({
        liveness: "/healthz",
        readiness: "/ready",
        checks: {
            db: async () => ({ ok: true, snippets: await store.count() }),
        },
    }))

    app.addRouter(openApi(app, {
        info: {
            title: "SQL Snippets API",
            version: "1.0.0",
            description: "Multi-file YASWS app — SQL snippets stored in libsql/Turso, viewed with Prism.js highlighting.",
        },
    }))

    app.addMiddleware(new TraceMiddleware())
    app.addMiddleware(new LoggerMiddleware())

    const corsMw = cors({ origin: "*", methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"] })
    app.addMiddleware(corsMw)
    app.addResponseInterceptor(corsMw.intercept)
    app.addResponseInterceptor(secureHeaders())

    app.onStart(async () => {
        app.logger.info(`sql-snippets starting; db=${opts.dbUrl}`)
        await initSchema(db)
        await seedDemoSnippets(store)
    })
    app.onShutdown(async () => {
        app.logger.info("sql-snippets shutting down")
    })

    return { app, store, db }
}
