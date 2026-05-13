import {
    Controller, Get, Post, Patch, Delete, Router,
    Body, Param, Query, HttpCode, SetHeader,
    UseExceptionFilters,
    YasswsResponse, NotFoundError,
    ApiTags, ApiOperation, ApiResponse, ApiBody,
} from "yasws"

import type { SnippetStore } from "../../domain/snippet-store.js"
import type { CreateSnippetInput, UpdateSnippetInput } from "../../domain/snippet.js"
import { ProblemFilter } from "../../shared/problem.filter.js"
import { createSnippetSchema, updateSnippetSchema } from "./snippets.schemas.js"

const snippetJsonSchema = {
    type: "object",
    required: ["id", "title", "language", "code", "author", "createdAt"],
    properties: {
        id: { type: "string" },
        title: { type: "string" },
        language: { type: "string" },
        code: { type: "string" },
        author: { type: "string" },
        createdAt: { type: "string", format: "date-time" },
    },
} as const

const problemFilter = new ProblemFilter()

@Controller("/snippets")
@ApiTags("snippets")
export class SnippetsController extends Router {
    public constructor(private readonly store: SnippetStore) {
        super()
    }

    @Get("/")
    @ApiOperation({ summary: "List snippets, optionally filtered by language" })
    @ApiResponse({ status: 200, jsonSchema: { type: "array", items: snippetJsonSchema } })
    async list(@Query("language") language: string | undefined) {
        return YasswsResponse.json({ snippets: await this.store.list(language) })
    }

    @Get("/:id")
    @ApiOperation({ summary: "Fetch one snippet by id" })
    @ApiResponse({ status: 200, jsonSchema: snippetJsonSchema })
    @ApiResponse({ status: 404 })
    async findOne(@Param("id") id: string) {
        const s = await this.store.get(id)
        if (!s) throw new NotFoundError(`no snippet with id ${id}`)
        return YasswsResponse.json(s)
    }

    @Post("/")
    @HttpCode(201)
    @SetHeader("X-Resource", "snippet")
    @UseExceptionFilters(problemFilter)
    @ApiOperation({ summary: "Create a snippet" })
    @ApiBody({ required: true })
    @ApiResponse({ status: 201, jsonSchema: snippetJsonSchema })
    @ApiResponse({ status: 422, description: "Validation failed" })
    async create(@Body(createSnippetSchema) input: CreateSnippetInput) {
        return YasswsResponse.json(await this.store.create(input))
    }

    @Patch("/:id")
    @UseExceptionFilters(problemFilter)
    @ApiOperation({ summary: "Patch a snippet" })
    @ApiResponse({ status: 200, jsonSchema: snippetJsonSchema })
    @ApiResponse({ status: 404 })
    async update(
        @Param("id") id: string,
        @Body(updateSnippetSchema) patch: UpdateSnippetInput,
    ) {
        const s = await this.store.update(id, patch)
        if (!s) throw new NotFoundError(`no snippet with id ${id}`)
        return YasswsResponse.json(s)
    }

    @Delete("/:id")
    @HttpCode(204)
    @ApiOperation({ summary: "Delete a snippet" })
    @ApiResponse({ status: 204 })
    @ApiResponse({ status: 404 })
    async remove(@Param("id") id: string) {
        if (!(await this.store.delete(id))) throw new NotFoundError(`no snippet with id ${id}`)
        return YasswsResponse.empty(204)
    }
}
