import {
    Controller, Get, Router, Param, YasswsResponse, NotFoundError,
    ApiTags, ApiOperation, ApiResponse,
} from "yasws"

import { PRISM_LANGUAGES, isPrismLanguage } from "./prism-languages.js"
import type { SnippetStore } from "../../domain/snippet-store.js"

@Controller("/languages")
@ApiTags("languages")
export class LanguagesController extends Router {
    public constructor(private readonly store: SnippetStore) {
        super()
    }

    @Get("/")
    @ApiOperation({ summary: "List all Prism.js languages supported by this server" })
    @ApiResponse({ status: 200 })
    async list() {
        return YasswsResponse.json({ languages: PRISM_LANGUAGES })
    }

    @Get("/:lang")
    @ApiOperation({ summary: "Stats for snippets in a given language" })
    @ApiResponse({ status: 200 })
    @ApiResponse({ status: 404 })
    async stats(@Param("lang") lang: string) {
        if (!isPrismLanguage(lang)) throw new NotFoundError(`unknown language '${lang}'`)
        const snippets = await this.store.list(lang)
        return YasswsResponse.json({
            language: lang,
            count: snippets.length,
            ids: snippets.map(s => s.id),
        })
    }
}
