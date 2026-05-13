import { YASWSNodeHTTP } from "yasws"
import { buildApp } from "./app.js"

const port = Number(process.env.PORT ?? 8080)
const host = process.env.HOST ?? "localhost"

const server = new YASWSNodeHTTP(buildApp(), { port, host })
const info = await server.listen()
console.log(`hello-world (node:http) listening on http://${info.host}:${info.port}`)
