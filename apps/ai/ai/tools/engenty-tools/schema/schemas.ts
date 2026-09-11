import { z } from "zod";

const toolKindSchema = z.enum(["all", "tool"]);

export const searchInputSchema = z.object({
  kind: toolKindSchema.default("all"),
  limit: z.number().int().min(1).max(20).default(10),
  moduleId: z.string().trim().min(1).optional(),
  query: z.string().trim().min(1).optional(),
  readOnlyOnly: z.boolean().default(false),
});

export const discoverInputSchema = z.object({
  limit: z.number().int().min(1).max(10).default(5),
  moduleId: z.string().trim().min(1).optional(),
  readOnlyOnly: z.boolean().default(false),
  request: z.string().trim().min(1).max(2000),
});

export const describeInputSchema = z.object({
  id: z.string().trim().min(1),
});

/** Execute-side schema: objects (code-mode, tests) and JSON strings both parse. */
export const runInputSchema = z
  .object({
    id: z.string().trim().min(1),
    input: z
      .union([z.string(), z.record(z.string(), z.unknown())])
      .optional()
      .describe(
        "Operation arguments as a JSON string, or as an object. Nested objects are stripped by some providers — prefer a JSON string."
      ),
  })
  .catchall(z.unknown());

/**
 * What the chat model sees for `engenty_tool_execute`. Nested `input: { … }`
 * objects serialize as an empty JSON schema (or `additionalProperties: false`
 * with no properties) and providers then constrain the call to `input: {}`.
 * A required JSON **string** survives function calling; execute parses it.
 */
export const runExecuteModelInputJsonSchema = {
  additionalProperties: false,
  properties: {
    id: {
      description:
        "Operation id from engenty_tools_search, e.g. contacts_create",
      type: "string",
    },
    input: {
      description:
        'JSON object of the operation arguments as a STRING, e.g. {"type":"organisation","display_name":"SFG","website":"https://www.sfg.at/"}. Use "{}" only for read-only tools that take no arguments. Do not pass a nested object — providers strip nested objects to {}.',
      type: "string",
    },
  },
  required: ["id", "input"],
  type: "object",
} as const;

export type DescribeEngentyToolInput = z.input<typeof describeInputSchema>;
export type DiscoverEngentyToolInput = z.input<typeof discoverInputSchema>;
export type DiscoverEngentyToolOptions = z.output<typeof discoverInputSchema>;
export type RunEngentyToolInput = z.input<typeof runInputSchema>;
export type SearchEngentyToolInput = z.input<typeof searchInputSchema>;
export type SearchEngentyToolOptions = z.output<typeof searchInputSchema>;
