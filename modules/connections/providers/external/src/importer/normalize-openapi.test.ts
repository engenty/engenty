import { describe, expect, it } from "vitest";
import { normalizeOpenApiSpec } from "./normalize-openapi.js";

const spec = {
  components: {
    securitySchemes: {
      bearerAuth: { scheme: "bearer", type: "http" },
    },
  },
  info: { title: "Mini Petstore", version: "1.0.0" },
  openapi: "3.0.3",
  paths: {
    "/pets": {
      get: {
        operationId: "listPets",
        parameters: [
          {
            in: "query",
            name: "limit",
            required: false,
            schema: { type: "integer" },
          },
        ],
        responses: { "200": { description: "ok" } },
        summary: "List pets",
      },
      post: {
        operationId: "createPet",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                properties: { name: { type: "string" } },
                required: ["name"],
                type: "object",
              },
            },
          },
          required: true,
        },
        responses: { "201": { description: "created" } },
        summary: "Create a pet",
      },
    },
    "/pets/{petId}": {
      delete: {
        operationId: "deletePet",
        parameters: [
          {
            in: "path",
            name: "petId",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: { "204": { description: "gone" } },
      },
      get: {
        deprecated: true,
        operationId: "getPetLegacy",
        parameters: [
          {
            in: "path",
            name: "petId",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: { "200": { description: "ok" } },
      },
    },
  },
  servers: [
    {
      url: "https://api.pets.example/v{version}",
      variables: { version: { default: "1" } },
    },
  ],
};

describe("normalizeOpenApiSpec", () => {
  it("normalizes operations with ids, classification, and request mapping", async () => {
    const result = await normalizeOpenApiSpec(JSON.stringify(spec));

    expect(result.title).toBe("Mini Petstore");
    expect(result.base_url).toBe("https://api.pets.example/v1");
    expect(result.security_schemes).toHaveProperty("bearerAuth");

    const ids = result.actions.map((a) => a.id);
    expect(ids).toContain("list_pets");
    expect(ids).toContain("create_pet");
    expect(ids).toContain("delete_pet");

    const list = result.actions.find((a) => a.id === "list_pets");
    expect(list?.classification).toBe("read");
    expect(list?.invoke).toMatchObject({
      kind: "http",
      method: "get",
      path_template: "/pets",
    });
    if (list?.invoke.kind !== "http") {
      throw new Error("expected http invoke");
    }
    expect(list.invoke.params).toEqual([
      { location: "query", name: "limit", required: false },
    ]);

    const create = result.actions.find((a) => a.id === "create_pet");
    expect(create?.classification).toBe("write");
    if (create?.invoke.kind !== "http") {
      throw new Error("expected http invoke");
    }
    expect(create.invoke.body_content_type).toBe("application/json");
    // The merged input schema nests the request body under `body`.
    expect(
      (create.input_json_schema.properties as Record<string, unknown>) ?? {}
    ).toHaveProperty("body");

    const del = result.actions.find((a) => a.id === "delete_pet");
    expect(del?.classification).toBe("destructive");
  });

  it("skips deprecated operations with a reason", async () => {
    const result = await normalizeOpenApiSpec(JSON.stringify(spec));
    expect(result.actions.map((a) => a.id)).not.toContain("get_pet_legacy");
    expect(result.skipped).toContainEqual({
      id: "getPetLegacy",
      reason: "deprecated",
    });
  });

  it("rejects oversized specs", async () => {
    const huge = JSON.stringify(spec) + " ".repeat(6 * 1024 * 1024);
    await expect(normalizeOpenApiSpec(huge)).rejects.toThrow(/spec too large/u);
  });
});

describe("registry spec overrides", () => {
  it("applies a correction before extraction", async () => {
    const result = await normalizeOpenApiSpec(JSON.stringify(spec), {
      specOverrides: [
        {
          op: "replace",
          path: "/components/securitySchemes/bearerAuth",
          value: { in: "header", name: "X-Api-Key", type: "apiKey" },
        },
      ],
    });
    expect(result.applied_overrides).toBe(1);
    expect(result.security_schemes).toEqual({
      bearerAuth: { in: "header", name: "X-Api-Key", type: "apiKey" },
    });
  });

  it("adds operations the published spec is missing", async () => {
    const result = await normalizeOpenApiSpec(JSON.stringify(spec), {
      specOverrides: [
        {
          op: "add",
          path: "/paths/~1health",
          value: {
            get: {
              operationId: "getHealth",
              responses: { "200": { description: "ok" } },
              summary: "Health",
            },
          },
        },
      ],
    });
    expect(result.actions.map((action) => action.id)).toContain("get_health");
  });

  it("fails the import when a correction does not apply", async () => {
    await expect(
      normalizeOpenApiSpec(JSON.stringify(spec), {
        specOverrides: [
          { op: "replace", path: "/components/securitySchemes/nope", value: 1 },
        ],
      })
    ).rejects.toThrow(/registry spec overrides do not apply/u);
  });

  it("normalizes the unpatched spec when there are no overrides", async () => {
    const result = await normalizeOpenApiSpec(JSON.stringify(spec));
    expect(result.applied_overrides).toBe(0);
  });
});
