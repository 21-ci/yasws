export { normalizePath, removeStartSlash, addEndSlash, removeEndSlash, lowercaseHeaders }

function normalizePath(str: string): string {
    if (str === "") return ""
    str = removeStartSlash(str)
    str = addEndSlash(str)
    return str
}

function addEndSlash(str: string): string {
    if (!str.endsWith("/")) str += "/"
    return str
}

function removeEndSlash(str: string): string {
    if (str.length > 1 && str.endsWith("/")) str = str.slice(0, -1)
    return str
}

function removeStartSlash(str: string): string {
    if (str.startsWith("/")) str = str.slice(1)
    return str
}

function lowercaseHeaders(h: Record<string, string | string[] | undefined>): Record<string, string | string[]> {
    const out: Record<string, string | string[]> = {}
    for (const k of Object.keys(h)) {
        const v = h[k]
        if (v === undefined) continue
        out[k.toLowerCase()] = v
    }
    return out
}
