/**
 * WASI HTTP entry. The component exports `incomingHandler.handle` — that name
 * is required by the WIT world (`wasi:http/incoming-handler@0.2.10`).
 *
 * The DB URL is baked in via `wasiDefaults` because componentize-js does not
 * give us reliable access to `process.env`. Override by rebuilding with a
 * different default, or by setting `DB_URL` in the host's environment and
 * reading it through a custom WIT import in a real deployment.
 *
 * IMPORTANT: outbound HTTP from the component (the libsql request) needs
 * `wasmtime serve -Shttp ...` — see `npm run serve:wasi` in package.json.
 */

// @ts-expect-error — wasi:http/types is provided by the host at link time.
import * as wasiHttpTypes from "wasi:http/types@0.2.10"

import {
    yasswsWasiHttpHandle,
    type WasiIncomingRequest,
    type WasiResponseOutparam,
} from "yasws"
import { buildApp } from "./app.js"
import { wasiDefaults } from "./infra/config.js"

const { app } = buildApp({ dbUrl: wasiDefaults.dbUrl })
const handler = app.toHandler()
let started = false

export const incomingHandler = {
    async handle(request: WasiIncomingRequest, responseOut: WasiResponseOutparam) {
        if (!started) {
            await app.start()    // runs onStart → initSchema + seed
            started = true
        }
        await yasswsWasiHttpHandle(handler, request, responseOut, wasiHttpTypes)
    },
}
