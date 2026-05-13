export interface Snippet {
    id: string
    title: string
    language: string
    code: string
    author: string
    createdAt: string
}

export interface CreateSnippetInput {
    title: string
    language: string
    code: string
    author?: string
}

export interface UpdateSnippetInput {
    title?: string
    language?: string
    code?: string
}
