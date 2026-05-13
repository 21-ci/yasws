// @ts-expect-error — wasi:http/types is provided by the host at link time.
import * as wasiHttpTypes from "wasi:http/types@0.2.10"

import {
    Controller,
    Get,
    Post,
    Router,
    Dispatcher,
    YasswsRequest,
    YasswsResponse,
    BadRequestError,
    yasswsWasiHttpHandle,
    secureHeaders,
    type WasiIncomingRequest,
    type WasiResponseOutparam,
} from "yasws"

@Controller("/")
class HelloController extends Router {
    @Get("/")
    async root() {
        return YasswsResponse.json({ hello: "world", framework: "yasws", transport: "wasi:http" })
    }

    @Get("/hi/:name/")
    async greet(req: YasswsRequest) {
        const name = req.params.name
        if (!name || name.length > 64) throw new BadRequestError("invalid 'name'")
        return YasswsResponse.text(`hello, ${name}`)
    }

    @Post("/echo/")
    async echo(req: YasswsRequest) {
        const body = await req.json<Record<string, unknown>>()
        return YasswsResponse.json({ youSent: body })
    }
}

const app = new Dispatcher({ name: "hello-wasi" })
app.addRouter(new HelloController())
app.addResponseInterceptor(secureHeaders())

const handler = app.toHandler()

// This is the WASI HTTP guest export. `wasmtime serve` calls `incomingHandler.handle`
// for every HTTP request and waits for it to resolve before flushing the response.
export const incomingHandler = {
    async handle(request: WasiIncomingRequest, responseOut: WasiResponseOutparam) {
        await yasswsWasiHttpHandle(handler, request, responseOut, wasiHttpTypes)
    },
}
