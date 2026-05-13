// Empty stub for the `ws` package. `@libsql/client/http` pulls it in
// transitively but the HTTP-only code path never instantiates it.
// componentize-js cannot evaluate the real `ws` (it does `require("events")`
// at module load, which the SpiderMonkey-in-wasm runtime doesn't support).
//
// Any actual attempt to use these throws — that's fine because the http
// client doesn't use them.

class WebSocket {
    constructor() { throw new Error("ws unavailable in WASI build") }
}

class WebSocketServer {
    constructor() { throw new Error("ws unavailable in WASI build") }
}

export default WebSocket
export { WebSocket, WebSocketServer }
