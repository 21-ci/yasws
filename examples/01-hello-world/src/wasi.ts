// @ts-expect-error — wasi:http/types is provided by the host at link time.
import * as wasiHttpTypes from "wasi:http/types@0.2.10"

import {
    yasswsWasiHttpHandle,
    type WasiIncomingRequest,
    type WasiResponseOutparam,
} from "yasws"
import { buildApp } from "./app.js"

const handler = buildApp().toHandler()

// This is the WASI HTTP guest export. `wasmtime serve` calls
// `incomingHandler.handle` for every HTTP request and waits for it to resolve
// before flushing the response.
export const incomingHandler = {
    async handle(request: WasiIncomingRequest, responseOut: WasiResponseOutparam) {
        await yasswsWasiHttpHandle(handler, request, responseOut, wasiHttpTypes)
    },
}
