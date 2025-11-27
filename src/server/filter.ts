import type { Request } from "./request.js"

export type { Filter }

interface Filter {
    call(request: Request): boolean
}
