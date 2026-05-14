export { Method, isMethod, normalizeMethod }

enum Method {
    GET = "GET",
    POST = "POST",
    PUT = "PUT",
    DELETE = "DELETE",
    PATCH = "PATCH",
    HEAD = "HEAD",
    OPTIONS = "OPTIONS",
    TRACE = "TRACE",
    CONNECT = "CONNECT",
    ALL = "*",
}

const KNOWN: Set<string> = new Set(Object.values(Method))

function isMethod(s: string): s is Method {
    return KNOWN.has(s.toUpperCase())
}

function normalizeMethod(s: string | Method): string {
    return s.toUpperCase()
}
