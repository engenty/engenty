import type {
  ClassifierClient,
  SystemOneRequest,
} from "@engenty/typesafe-client";
import { describe, expect, it } from "vitest";
import { selectToolIds } from "../../ai/tools/engenty-tools/engenty-tools-discover-tool.js";
import type { NormalizedEngentyToolEntry } from "../../ai/tools/engenty-tools/schema/types.js";

function entry(id: string, summary: string): NormalizedEngentyToolEntry {
  return {
    id,
    moduleId: "knowledge-base",
    summary,
  } as unknown as NormalizedEngentyToolEntry;
}

const entries = [
  entry("kb_articles_list", "List articles"),
  entry("kb_search", "Search the knowledge base"),
  entry("contacts_list", "List contacts"),
];

const input = {
  limit: 5,
  request: "search for Förderungen in KB",
} as Parameters<typeof selectToolIds>[0];

function classifierAnswering(
  pYes: number[]
): ClassifierClient & { requests: SystemOneRequest[] } {
  const requests: SystemOneRequest[] = [];
  return {
    requests,
    systemOne: async (request) => {
      requests.push(request);
      return {
        answers: Object.fromEntries(
          Object.keys(request.questions).map((key, index) => [
            key,
            { noul: pYes[index] ?? 0, type: "noul" as const },
          ])
        ),
        model: "test",
      };
    },
  };
}

describe("selectToolIds", () => {
  it("judges every candidate in ONE classifier call and keeps the likely ones, most likely first", async () => {
    const classifier = classifierAnswering([0.55, 0.92, 0.1]);
    const ids = await selectToolIds(input, entries, classifier);
    expect(classifier.requests).toHaveLength(1);
    expect(ids).toEqual(["kb_search", "kb_articles_list"]);
  });
});
