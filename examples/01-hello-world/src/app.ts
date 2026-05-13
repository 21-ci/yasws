/**
 * Transport-agnostic Dispatcher. Same handlers as example 01, but with the
 * WASI-focused build pipeline (this example exists primarily to document the
 * componentize-js + wasmtime serve setup). The Node entry (`node.ts`) is
 * provided so you can iterate without rebuilding the wasm on every change.
 */

import {
    Controller, Get, Post, Router, Dispatcher,
    YasswsRequest, YasswsResponse,
    BadRequestError,
    secureHeaders,
} from "yasws"

@Controller("/")
class HelloController extends Router {
    @Get("/")
    async root() {
        return YasswsResponse.json({ hello: "world" })
    }

    @Get("/hi/:name/")
    async greet(req: YasswsRequest) {
        const name = req.params.name
        if (!name || name.length > 64) throw new BadRequestError("invalid 'name'")
        return YasswsResponse.text(`hello, ${name}`)
    }

}

export function buildApp(): Dispatcher {
    const app = new Dispatcher({ name: "hello-world" })
    app.addRouter(new HelloController())
    app.addResponseInterceptor(secureHeaders())
    return app
}
