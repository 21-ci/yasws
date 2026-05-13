import { YASWSNodeHTTP } from "yasws"
import { buildApp } from "./app.js"

const app = buildApp()

const port = Number(process.env.PORT ?? 8000)
const server = new YASWSNodeHTTP(app, {
    port,
    limits: {
        maxBodyBytes: 1 * 1024 * 1024,
        requestTimeoutMs: 30_000,
        headersTimeoutMs: 60_000,
        keepAliveTimeoutMs: 5_000,
    },
    drainTimeoutMs: 30_000,
})

const info = await server.listen()
console.log(`portable-rest (node:http) listening on http://${info.host}:${info.port}`)
