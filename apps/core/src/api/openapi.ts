import type { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";

export function registerOpenApiEndpoints(app: OpenAPIHono) {
  app.get("/api/openapi.json", (c) => {
    const document = app.getOpenAPIDocument({
      openapi: "3.0.0",
      info: {
        title: "Engenty API",
        version: "0.0.1",
        description:
          "Core API with plugin-registered routes and gateway methods.",
      },
    });
    return c.json(document);
  });

  app.get(
    "/api/docs",
    Scalar({
      pageTitle: "Engenty API Docs",
      theme: "kepler",
      url: "/api/openapi.json",
    })
  );
}
