/**
 * Node entry. Loads env-driven config (only here — `buildApp` is pure so it
 * compiles to WASI without dragging `process.env` into the wasm).
 */

import { YASWSNodeHTTP } from "yasws"
import { buildApp } from "./app.js"
import { loadConfig } from "./infra/config.js"

const cfg = loadConfig()
const { app } = buildApp({ dbUrl: cfg.dbUrl, ...(cfg.dbAuthToken ? { dbAuthToken: cfg.dbAuthToken } : {}) })

const server = new YASWSNodeHTTP(app, {
    port: cfg.port,
    host: cfg.host,
    limits: { maxBodyBytes: cfg.bodyLimitBytes },
})

const info = await server.listen()
app.logger.info(`sql-snippets (node:http) listening on http://${info.host}:${info.port}`)
app.logger.info(`  ui     → http://localhost:${info.port}/`)
app.logger.info(`  api    → http://localhost:${info.port}/api/snippets`)
app.logger.info(`  docs   → http://localhost:${info.port}/docs`)
app.logger.info(`  health → http://localhost:${info.port}/healthz`)
app.logger.info(`  db     → ${cfg.dbUrl}`)
