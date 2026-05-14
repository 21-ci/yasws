export interface AppConfig {
    port: number
    host: string
    apiKey: string
    bodyLimitBytes: number
    dbUrl: string
    dbAuthToken?: string
}

export function loadConfig(): AppConfig {
    return {
        port: Number(process.env.PORT ?? 8000),
        host: process.env.HOST ?? "0.0.0.0",
        apiKey: process.env.API_KEY ?? "dev-secret",
        bodyLimitBytes: Number(process.env.BODY_LIMIT_BYTES ?? 2 * 1024 * 1024),
        dbUrl: process.env.DB_URL ?? "http://localhost:8081",
        ...(process.env.DB_AUTH_TOKEN ? { dbAuthToken: process.env.DB_AUTH_TOKEN } : {}),
    }
}

/** Same defaults but without `process.env` — used by the WASI entry. */
export const wasiDefaults: AppConfig = {
    port: 8000,
    host: "0.0.0.0",
    apiKey: "dev-secret",
    bodyLimitBytes: 2 * 1024 * 1024,
    dbUrl: "http://localhost:8081",
}
