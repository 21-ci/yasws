import type { Client } from "../infra/db.js"
import type { Snippet, CreateSnippetInput, UpdateSnippetInput } from "./snippet.js"

/**
 * SQL-backed repository for snippets. Every method does exactly one query —
 * keep complex orchestration out of here so this layer stays trivially
 * testable against a real libsql instance.
 */
export class SnippetStore {
    public constructor(private readonly db: Client) {}

    public async list(language?: string): Promise<Snippet[]> {
        const rs = language === undefined
            ? await this.db.execute("SELECT * FROM snippets ORDER BY id DESC")
            : await this.db.execute({
                sql: "SELECT * FROM snippets WHERE language = ? ORDER BY id DESC",
                args: [language],
            })
        return rs.rows.map(rowToSnippet)
    }

    public async get(id: string): Promise<Snippet | undefined> {
        const rs = await this.db.execute({
            sql: "SELECT * FROM snippets WHERE id = ?",
            args: [id],
        })
        const row = rs.rows[0]
        return row ? rowToSnippet(row) : undefined
    }

    public async create(input: CreateSnippetInput): Promise<Snippet> {
        const rs = await this.db.execute({
            sql: `INSERT INTO snippets (title, language, code, author)
                  VALUES (?, ?, ?, ?)
                  RETURNING *`,
            args: [input.title, input.language, input.code, input.author ?? "anonymous"],
        })
        return rowToSnippet(rs.rows[0]!)
    }

    public async update(id: string, patch: UpdateSnippetInput): Promise<Snippet | undefined> {
        const sets: string[] = []
        const args: Array<string | number> = []
        if (patch.title !== undefined) { sets.push("title = ?"); args.push(patch.title) }
        if (patch.language !== undefined) { sets.push("language = ?"); args.push(patch.language) }
        if (patch.code !== undefined) { sets.push("code = ?"); args.push(patch.code) }
        if (sets.length === 0) return this.get(id)
        args.push(id)
        const rs = await this.db.execute({
            sql: `UPDATE snippets SET ${sets.join(", ")} WHERE id = ? RETURNING *`,
            args,
        })
        const row = rs.rows[0]
        return row ? rowToSnippet(row) : undefined
    }

    public async delete(id: string): Promise<boolean> {
        const rs = await this.db.execute({
            sql: "DELETE FROM snippets WHERE id = ?",
            args: [id],
        })
        return rs.rowsAffected > 0
    }

    public async count(): Promise<number> {
        const rs = await this.db.execute("SELECT COUNT(*) AS n FROM snippets")
        return Number(rs.rows[0]!.n)
    }
}

function rowToSnippet(row: Record<string, unknown>): Snippet {
    return {
        id:        String(row.id),
        title:     String(row.title),
        language:  String(row.language),
        code:      String(row.code),
        author:    String(row.author),
        createdAt: String(row.created_at),
    }
}
