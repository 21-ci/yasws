import type { Filter, YasswsRequest } from "yasws"

/**
 * Toy auth: writes endpoints (POST/PATCH/DELETE) require a shared API key in
 * the `x-api-key` header. Read endpoints (GET) are public and skip this filter.
 *
 * In a real app prefer JWT/OAuth2 — this is just to demonstrate `@UseFilters(...)`.
 */
export class ApiKeyFilter implements Filter {
    public constructor(private readonly expected: string) {}

    public call(request: YasswsRequest): boolean {
        return request.header("x-api-key") === this.expected
    }
}
