function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, c =>
        c === "&" ? "&amp;" :
        c === "<" ? "&lt;" :
        c === ">" ? "&gt;" :
        c === '"' ? "&quot;" : "&#39;",
    )
}

const PRISM_VERSION = "1.29.0"

const HEAD = `
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/${PRISM_VERSION}/themes/prism-tomorrow.min.css" />
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/${PRISM_VERSION}/plugins/line-numbers/prism-line-numbers.min.css" />
<style>
  :root { color-scheme: dark; }
  body { margin: 0; padding: 0; background: #0b0d10; color: #e6e6e6; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  header { padding: 1.25rem 2rem; background: #11141a; border-bottom: 1px solid #1f242c; display: flex; align-items: center; justify-content: space-between; }
  header h1 { margin: 0; font-size: 1.1rem; }
  header nav a { color: #8fc1ff; margin-left: 1rem; text-decoration: none; }
  main { max-width: 980px; margin: 0 auto; padding: 2rem; }
  .meta { color: #8a93a3; font-size: 0.9rem; margin-bottom: 1rem; }
  .empty { color: #8a93a3; }
  pre[class*=language-] { border-radius: 8px; }
  .card { background: #11141a; border: 1px solid #1f242c; border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: 1.25rem; }
  .card h2 { margin: 0 0 0.5rem 0; font-size: 1rem; }
  .badge { display: inline-block; padding: 0.1rem 0.5rem; border-radius: 4px; background: #1d2430; color: #8fc1ff; font-size: 0.75rem; margin-left: 0.5rem; }
</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/prism/${PRISM_VERSION}/prism.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/prism/${PRISM_VERSION}/plugins/autoloader/prism-autoloader.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/prism/${PRISM_VERSION}/plugins/line-numbers/prism-line-numbers.min.js"></script>
`

const NAV = `
<header>
  <h1>yasws · prism snippets</h1>
  <nav>
    <a href="/">snippets</a>
    <a href="/docs">api docs</a>
    <a href="/openapi.json">openapi.json</a>
  </nav>
</header>
`

export function indexPage(snippets: ReadonlyArray<{ id: string; title: string; language: string; author: string; code: string }>): string {
    const cards = snippets.length === 0
        ? `<p class="empty">no snippets yet — POST one to /api/snippets</p>`
        : snippets.map(s => `
            <article class="card">
              <h2>
                <a href="/snippets/${escapeHtml(s.id)}" style="color:#e6e6e6;text-decoration:none">${escapeHtml(s.title)}</a>
                <span class="badge">${escapeHtml(s.language)}</span>
              </h2>
              <div class="meta">by ${escapeHtml(s.author)}</div>
              <pre class="line-numbers"><code class="language-${escapeHtml(s.language)}">${escapeHtml(s.code)}</code></pre>
            </article>
        `).join("")
    return `<!doctype html><html lang="en"><head><title>yasws · snippets</title>${HEAD}</head>
<body>${NAV}<main>${cards}</main></body></html>`
}

export function snippetPage(s: { id: string; title: string; language: string; author: string; code: string; createdAt: string }): string {
    return `<!doctype html><html lang="en"><head><title>${escapeHtml(s.title)}</title>${HEAD}</head>
<body>${NAV}<main>
  <article class="card">
    <h2>${escapeHtml(s.title)} <span class="badge">${escapeHtml(s.language)}</span></h2>
    <div class="meta">by ${escapeHtml(s.author)} · ${escapeHtml(s.createdAt)}</div>
    <pre class="line-numbers"><code class="language-${escapeHtml(s.language)}">${escapeHtml(s.code)}</code></pre>
  </article>
</main></body></html>`
}

/** CSP that permits Prism.js assets from cdnjs.cloudflare.com on the UI routes. */
export const UI_CSP = [
    "default-src 'self'",
    "script-src 'self' https://cdnjs.cloudflare.com 'unsafe-inline'",
    "style-src 'self' https://cdnjs.cloudflare.com 'unsafe-inline'",
    "font-src 'self' https://cdnjs.cloudflare.com data:",
    "img-src 'self' https://cdnjs.cloudflare.com data:",
    "connect-src 'self'",
].join("; ")
