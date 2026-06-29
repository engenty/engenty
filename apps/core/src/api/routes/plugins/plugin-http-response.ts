import {
  apiErrorResponseSchema,
  apiPaginatedMetaSchema,
  apiSuccessSchema,
  isApiSuccess,
  isJsonContentType,
  normalizeSuccessPayload,
} from "@engenty/api-contracts";
import type {
  PluginHttpResponseMode,
  PluginHttpResponseSpec,
  PluginHttpRoute,
} from "@engenty/plugin-sdk";
import { z } from "@hono/zod-openapi";
import { parseLegacyErrorBody } from "../api-response.js";

function getResponseMode(route: PluginHttpRoute): PluginHttpResponseMode {
  return route.responseMode ?? "json";
}

function inferSuccessStatus(route: PluginHttpRoute) {
  const statuses = Object.keys(
    route.responses ?? {
      200: { description: "OK" },
    }
  )
    .map(Number)
    .filter((status) => status >= 200 && status < 300)
    .sort((a, b) => a - b);

  return statuses[0] ?? 200;
}

function unwrapSuccessSchema(schema?: z.ZodType) {
  if (!schema) {
    return { dataSchema: z.any() };
  }

  if (!(schema instanceof z.ZodObject)) {
    return { dataSchema: schema };
  }

  const shape = schema.shape;

  if (
    "data" in shape &&
    "total" in shape &&
    "page" in shape &&
    "pageSize" in shape
  ) {
    return {
      dataSchema: shape.data,
      metaSchema: apiPaginatedMetaSchema,
    };
  }

  if (Object.keys(shape).length === 1 && "data" in shape) {
    return {
      dataSchema: shape.data,
    };
  }

  return { dataSchema: schema };
}

function responseContentType(mode: PluginHttpResponseMode) {
  switch (mode) {
    case "binary":
      return "application/octet-stream";
    case "stream":
      return "text/event-stream";
    case "json":
      return "application/json";
    case "empty":
      return null;
  }
}

function normalizeResponseSchema(
  route: PluginHttpRoute,
  status: number,
  response: PluginHttpResponseSpec
) {
  const mode = getResponseMode(route);
  if (!(status >= 200 && status < 300)) {
    return {
      description: response.description ?? "Request failed",
      content: {
        "application/json": {
          schema: apiErrorResponseSchema,
        },
      },
    };
  }
  if (mode === "empty") {
    return {
      description: response.description ?? "No Content",
    };
  }

  const contentType = responseContentType(mode);
  if (!contentType) {
    return {
      description: response.description ?? "OK",
    };
  }

  if (mode !== "json") {
    return {
      description: response.description ?? "OK",
      content: {
        [contentType]: {
          schema: response.schema ?? z.any(),
        },
      },
    };
  }

  const schema =
    status >= 200 && status < 300
      ? (() => {
          const { dataSchema, metaSchema } = unwrapSuccessSchema(
            response.schema
          );
          return apiSuccessSchema(dataSchema, metaSchema);
        })()
      : apiErrorResponseSchema;

  return {
    description: response.description ?? "OK",
    content: {
      [contentType]: {
        schema,
      },
    },
  };
}

export function normalizeRouteResponses(route: PluginHttpRoute) {
  const responses = route.responses ?? {
    200: { description: "OK" },
  };

  return Object.fromEntries(
    Object.entries(responses).map(([status, response]) => [
      Number(status),
      normalizeResponseSchema(route, Number(status), response),
    ])
  );
}

function withJsonHeaders(response: Response, body: unknown) {
  const headers = new Headers(response.headers);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(body), {
    status: response.status,
    headers,
  });
}

export async function serializePluginRouteResult(
  route: PluginHttpRoute,
  result: Response | unknown
) {
  const mode = getResponseMode(route);
  if (mode !== "json") {
    if (result instanceof Response) {
      if (
        result.status >= 400 &&
        isJsonContentType(result.headers.get("content-type"))
      ) {
        const body = await result
          .clone()
          .json()
          .catch(() => undefined);
        if (body !== undefined) {
          return withJsonHeaders(
            result,
            parseLegacyErrorBody(result.status, body)
          );
        }
      }
      return result;
    }

    if (mode === "empty") {
      return new Response(null, { status: inferSuccessStatus(route) });
    }

    return new Response(result as BodyInit | null, {
      status: inferSuccessStatus(route),
    });
  }

  if (!(result instanceof Response)) {
    return new Response(JSON.stringify(normalizeSuccessPayload(result)), {
      status: inferSuccessStatus(route),
      headers: { "content-type": "application/json" },
    });
  }

  if (!isJsonContentType(result.headers.get("content-type"))) {
    return result;
  }

  const body = await result
    .clone()
    .json()
    .catch(() => undefined);
  if (body === undefined) {
    return result;
  }

  if (result.status >= 200 && result.status < 300) {
    const normalized = isApiSuccess(body)
      ? body
      : normalizeSuccessPayload(body);
    return withJsonHeaders(result, normalized);
  }

  return withJsonHeaders(result, parseLegacyErrorBody(result.status, body));
}
