import {
    Controller,
    Get,
    Post,
    Router,
    Dispatcher,
    YasswsRequest,
    YasswsResponse,
    YASWSNodeHTTP,
    BadRequestError,
    secureHeaders,
} from "yasws"

@Controller("/")
class HelloController extends Router {
    @Get("/")
    async root() {
        return YasswsResponse.json({ hello: "world", framework: "yasws", transport: "node:http" })
    }

    @Get("/hi/:name")
    async greet(req: YasswsRequest) {
        const name = req.params.name
        if (!name || name.length > 64) throw new BadRequestError("invalid 'name'")
        return YasswsResponse.text(`hello, ${name}`)
    }

    @Post("/echo")
    async echo(req: YasswsRequest) {
        const body = await req.json<Record<string, unknown>>()
        return YasswsResponse.json({ youSent: body })
    }
}

const app = new Dispatcher({ name: "hello-node" })
app.addRouter(new HelloController())
app.addResponseInterceptor(secureHeaders())

const port = Number(process.env.PORT ?? 8000)
const server = new YASWSNodeHTTP(app, {
    port,
    limits: {
        maxBodyBytes: 1 * 1024 * 1024,
        requestTimeoutMs: 30_000,
    },
})

const info = await server.listen()
console.log(`hello-node listening on http://${info.host}:${info.port}`)
