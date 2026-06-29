import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  generateTestData,
  TestDataLlmHttpError,
} from "./test-data-generator.js";

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const baseParams = {
  config: { testDataOpenAiApiKey: "sk-test-key" },
  count: 1,
  data_type: "team",
  logger,
  module_id: "team",
  recordSchema: z.object({ full_name: z.string() }),
  schemaDescription: "full_name: string",
};

function okOpenAiResponse(content: string) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("generateTestData", () => {
  it("retries on 429 then succeeds", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(
        okOpenAiResponse(JSON.stringify({ records: [{ full_name: "A" }] }))
      );

    const promise = generateTestData(baseParams);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({ full_name: "A" });
  });

  it("throws TestDataLlmHttpError after exhausting retries on 429", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("no", { status: 429 }));

    const promise = generateTestData(baseParams);
    const assertion = expect(promise).rejects.toMatchObject({
      httpStatus: 429,
    });
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("does not retry on 401", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }));

    await expect(generateTestData(baseParams)).rejects.toThrow(
      TestDataLlmHttpError
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
