export type { Header, RawHeaders }

interface Header {
    name: string
    data: string
}

type RawHeaders = Record<string, string | string[] | undefined>
