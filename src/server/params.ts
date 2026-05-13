export { matchPath, type MatchResult }

type MatchResult = Record<string, string>

/**
 * Match a route pattern against a request path. Supports:
 *   - exact segments:   "/users/list"
 *   - named params:     "/users/:id"
 *   - wildcard tail:    "/files/*rest"  or  "/files/*"   (captures remainder, may include '/')
 *
 * Returns the extracted params map on match, or null on no match.
 *
 * Both `pattern` and `path` are matched modulo leading and trailing slashes.
 */
function matchPath(pattern: string, path: string): MatchResult | null {
    const pSegs = splitSegments(pattern)
    const tSegs = splitSegments(path)
    const params: MatchResult = {}

    for (let i = 0; i < pSegs.length; i++) {
        const ps = pSegs[i]!
        if (ps.startsWith("*")) {
            const key = ps.slice(1) || "wildcard"
            params[key] = decodeURIComponentSafe(tSegs.slice(i).join("/"))
            return params
        }
        const ts = tSegs[i]
        if (ts === undefined) return null
        if (ps.startsWith(":")) {
            const key = ps.slice(1)
            if (!key) return null
            params[key] = decodeURIComponentSafe(ts)
        } else if (ps !== ts) {
            return null
        }
    }
    if (tSegs.length !== pSegs.length) return null
    return params
}

function splitSegments(p: string): string[] {
    const trimmed = p.replace(/^\/+/, "").replace(/\/+$/, "")
    if (trimmed === "") return []
    return trimmed.split("/")
}

function decodeURIComponentSafe(s: string): string {
    try { return decodeURIComponent(s) } catch { return s }
}
