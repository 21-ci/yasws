import { YasswsResponse, type ExceptionFilter } from "yasws"

/**
 * Maps thrown Errors with `validation failed: …` messages to RFC 7807-style
 * problem-details JSON with a 422 status. Anything else falls through to the
 * framework default (which renders 500 / the HttpError class).
 */
export class ProblemFilter implements ExceptionFilter {
    catch(err: unknown): YasswsResponse | undefined {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.startsWith("validation failed:")) {
            return YasswsResponse.json({
                type: "about:blank",
                title: "Unprocessable Entity",
                status: 422,
                detail: msg.slice("validation failed:".length).trim(),
            }, 422)
        }
        return undefined
    }
}
