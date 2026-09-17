import { describe, expect, it } from "vitest";
import {
  createStreamErrorRetryProcessor,
  isTransientNetworkError,
  STREAM_ERROR_MAX_RETRIES,
} from "../stream-error-retry.js";

const args = (error: unknown, retryCount: number) =>
  ({ error, retryCount, abortSignal: new AbortController().signal }) as never;

describe("stream error retry", () => {
  it("matches a dropped socket by message or code", () => {
    expect(isTransientNetworkError(new Error("socket hang up"))).toBe(true);
    expect(
      isTransientNetworkError(
        Object.assign(new TypeError("fetch failed"), { code: "ECONNRESET" })
      )
    ).toBe(true);
    expect(isTransientNetworkError(new Error("Invalid API key"))).toBe(false);
  });

  it("retries a transient error up to the cap, then gives up", async () => {
    const processor = createStreamErrorRetryProcessor();
    const error = new Error("socket hang up");
    await expect(
      processor.processAPIError(args(error, STREAM_ERROR_MAX_RETRIES - 1))
    ).resolves.toEqual({ retry: true });
    await expect(
      processor.processAPIError(args(error, STREAM_ERROR_MAX_RETRIES))
    ).resolves.toBeUndefined();
  });

  it("retries what the provider marks retryable and leaves moderation alone", async () => {
    const processor = createStreamErrorRetryProcessor();
    await expect(
      processor.processAPIError(
        args(Object.assign(new Error("overloaded"), { isRetryable: true }), 0)
      )
    ).resolves.toEqual({ retry: true });
    await expect(
      processor.processAPIError(
        args(
          Object.assign(new Error("data_inspection_failed"), {
            isRetryable: false,
          }),
          0
        )
      )
    ).resolves.toBeUndefined();
  });
});
