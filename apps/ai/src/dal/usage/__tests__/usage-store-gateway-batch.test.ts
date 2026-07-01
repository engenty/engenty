import { describe, expect, it } from "vitest";
import {
  chunkGatewayModelBatch,
  GATEWAY_MODEL_UPSERT_BATCH_SIZE,
} from "../usage-store.js";

describe("chunkGatewayModelBatch", () => {
  it("uses the default gateway sync batch size", () => {
    expect(GATEWAY_MODEL_UPSERT_BATCH_SIZE).toBe(75);
  });

  it("splits large model id lists for PostgREST .in() queries", () => {
    const modelIds = Array.from({ length: 297 }, (_, index) => `p/m-${index}`);
    const batches = chunkGatewayModelBatch(modelIds);
    expect(batches).toHaveLength(4);
    expect(batches[0]).toHaveLength(75);
    expect(batches[3]).toHaveLength(72);
    expect(batches.flat()).toEqual(modelIds);
  });

  it("returns a single batch when input fits", () => {
    expect(chunkGatewayModelBatch(["openai/gpt-5-mini"])).toEqual([
      ["openai/gpt-5-mini"],
    ]);
  });
});
