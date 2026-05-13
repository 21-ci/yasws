export const PRISM_LANGUAGES = [
    "markup", "html", "xml", "svg", "css", "clike", "javascript", "js",
    "typescript", "ts", "jsx", "tsx", "json", "yaml", "toml", "bash",
    "shell", "sql", "python", "py", "ruby", "rb", "go", "rust", "c",
    "cpp", "csharp", "java", "kotlin", "swift", "php", "lua", "scala",
    "haskell", "elixir", "erlang", "clojure", "dart", "r", "matlab",
    "perl", "powershell", "dockerfile", "makefile", "ini", "diff",
    "graphql", "markdown", "md", "wasm", "wat",
] as const

export type PrismLanguage = (typeof PRISM_LANGUAGES)[number]

export function isPrismLanguage(value: string): value is PrismLanguage {
    return (PRISM_LANGUAGES as readonly string[]).includes(value)
}
