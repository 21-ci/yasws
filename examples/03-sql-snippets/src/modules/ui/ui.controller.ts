import {
    Controller, Get, Router, Param, YasswsResponse, NotFoundError,
} from "yasws"

import type { SnippetStore } from "../../domain/snippet-store.js"
import { indexPage, snippetPage, UI_CSP } from "./ui.pages.js"

function htmlWithUiCsp(body: string): YasswsResponse {
    const res = YasswsResponse.html(body)
    res.setHeader("Content-Security-Policy", UI_CSP)
    return res
}

@Controller("/")
export class UiController extends Router {
    public constructor(private readonly store: SnippetStore) {
        super()
    }

    @Get("/")
    async index() {
        return htmlWithUiCsp(indexPage(await this.store.list()))
    }

    @Get("/snippets/:id")
    async show(@Param("id") id: string) {
        const s = await this.store.get(id)
        if (!s) throw new NotFoundError(`no snippet with id ${id}`)
        return htmlWithUiCsp(snippetPage(s))
    }
}
