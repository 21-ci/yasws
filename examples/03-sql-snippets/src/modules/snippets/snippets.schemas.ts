import type { CreateSnippetInput, UpdateSnippetInput } from "../../domain/snippet.js"
import { isPrismLanguage } from "../languages/prism-languages.js"

function fail(field: string, why: string): never {
    throw new Error(`validation failed: ${field} ${why}`)
}

function expectString(o: Record<string, unknown>, key: string, min: number, max: number): string {
    const v = o[key]
    if (typeof v !== "string") fail(key, "must be a string")
    if (v.length < min || v.length > max) fail(key, `must be ${min}..${max} chars`)
    return v
}

export const createSnippetSchema = {
    parse(input: unknown): CreateSnippetInput {
        if (!input || typeof input !== "object") fail("body", "must be an object")
        const o = input as Record<string, unknown>
        const title = expectString(o, "title", 1, 200)
        const language = expectString(o, "language", 1, 32)
        const code = expectString(o, "code", 1, 1_048_576)
        if (!isPrismLanguage(language)) fail("language", `unknown Prism language '${language}'`)
        const out: CreateSnippetInput = { title, language, code }
        if (o.author !== undefined) {
            out.author = expectString(o, "author", 1, 64)
        }
        return out
    },
}

export const updateSnippetSchema = {
    parse(input: unknown): UpdateSnippetInput {
        if (!input || typeof input !== "object") fail("body", "must be an object")
        const o = input as Record<string, unknown>
        const out: UpdateSnippetInput = {}
        if (o.title !== undefined) out.title = expectString(o, "title", 1, 200)
        if (o.language !== undefined) {
            const lang = expectString(o, "language", 1, 32)
            if (!isPrismLanguage(lang)) fail("language", `unknown Prism language '${lang}'`)
            out.language = lang
        }
        if (o.code !== undefined) out.code = expectString(o, "code", 1, 1_048_576)
        return out
    },
}
