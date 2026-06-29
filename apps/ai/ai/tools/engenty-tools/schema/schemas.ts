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

export const runInputSchema = z.object({
  id: z.string().trim().min(1),
  input: z.unknown().optional(),
});

export type DescribeEngentyToolInput = z.input<typeof describeInputSchema>;
export type DiscoverEngentyToolInput = z.input<typeof discoverInputSchema>;
export type DiscoverEngentyToolOptions = z.output<typeof discoverInputSchema>;
export type RunEngentyToolInput = z.input<typeof runInputSchema>;
export type SearchEngentyToolInput = z.input<typeof searchInputSchema>;
export type SearchEngentyToolOptions = z.output<typeof searchInputSchema>;
