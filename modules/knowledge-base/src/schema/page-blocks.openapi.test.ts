import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { describe, expect, it } from "vitest";
import { kbPageLayoutSettingsSchema } from "./page-blocks.js";

describe("page-blocks OpenAPI serialization", () => {
  // Regression for v0.1.117/118: a z.custom inside
  // kbCategoryCollectionSortBySchema made getOpenAPIDocument throw
  // "Unknown zod object type", which 500'd /api/openapi.json in prod — and
  // the edge healthcheck probing that endpoint turned it into a full outage.
  // Every schema that reaches an API route must serialize.
  it("serializes the page-layout schemas without throwing", () => {
    const app = new OpenAPIHono();
    app.openapi(
      createRoute({
        method: "put",
        path: "/layout",
        request: {
          body: {
            content: {
              "application/json": { schema: kbPageLayoutSettingsSchema },
            },
          },
        },
        responses: {
          200: { description: "ok" },
        },
      }),
      (c) => c.body(null, 200)
    );

    const doc = app.getOpenAPIDocument({
      openapi: "3.0.0",
      info: { title: "test", version: "0.0.0" },
    });
    expect(doc.paths["/layout"]).toBeDefined();
  });
});
