/**
 * LibSQL client factory + schema bootstrap.
 *
 * We import from `@libsql/client/http` rather than `@libsql/client` on purpose:
 * the `/web` entry uses only `fetch` (no native bindings, no node:net), so the
 * *same* code path runs under Node 22+ and under componentize-js (which
 * exposes `fetch` backed by `wasi:http/outgoing-handler`).
 *
 * The price is that the database has to be reachable over HTTP — i.e. you
 * need `turso dev` (or a Turso cloud DB) running at `DB_URL`. The Node entry
 * could use the embedded `file://` driver, but then Node and WASI would
 * diverge — not worth it for an example.
 */

import { createClient, type Client } from "@libsql/client/http"

export type { Client }

export function createDb(url: string, authToken?: string): Client {
    return createClient({ url, ...(authToken ? { authToken } : {}) })
}

export async function initSchema(db: Client): Promise<void> {
    await db.execute(`
        CREATE TABLE IF NOT EXISTS snippets (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT    NOT NULL,
            language    TEXT    NOT NULL,
            code        TEXT    NOT NULL,
            author      TEXT    NOT NULL DEFAULT 'anonymous',
            created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
        )
    `)
    await db.execute(`CREATE INDEX IF NOT EXISTS snippets_language ON snippets (language)`)
}
