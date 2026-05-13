import type { SnippetStore } from "../domain/snippet-store.js"

/**
 * Idempotent — only inserts the demo rows when the table is empty, so reruns
 * don't pile up duplicates.
 */
export async function seedDemoSnippets(store: SnippetStore): Promise<void> {
    if ((await store.count()) > 0) return

    await store.create({
        title: "Top 10 noisiest queries (last 24h)",
        language: "sql",
        author: "Ada",
        code: `SELECT query, calls, total_exec_time, mean_exec_time
FROM pg_stat_statements
WHERE last_call > now() - interval '24 hours'
ORDER BY total_exec_time DESC
LIMIT 10;`,
    })

    await store.create({
        title: "Recursive CTE: org chart",
        language: "sql",
        author: "Grace",
        code: `WITH RECURSIVE org AS (
    SELECT id, name, manager_id, 0 AS depth
    FROM employees WHERE manager_id IS NULL
    UNION ALL
    SELECT e.id, e.name, e.manager_id, org.depth + 1
    FROM employees e JOIN org ON e.manager_id = org.id
)
SELECT * FROM org ORDER BY depth, name;`,
    })

    await store.create({
        title: "Index bloat per table",
        language: "sql",
        author: "anonymous",
        code: `SELECT schemaname, relname, pg_size_pretty(pg_relation_size(indexrelid)) AS idx_size,
       idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY pg_relation_size(indexrelid) DESC
LIMIT 25;`,
    })

    await store.create({
        title: "Upsert with RETURNING",
        language: "sql",
        author: "Linus",
        code: `INSERT INTO users (email, name)
VALUES ($1, $2)
ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
RETURNING id, email, name;`,
    })
}
