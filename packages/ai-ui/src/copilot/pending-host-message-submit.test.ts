import { describe, expect, it } from "vitest";
import {
  decidePendingHostMessageSubmit,
  pendingHostMessageDelivered,
} from "./host-message-delivery.js";

const parked = {
  delivered: false,
  isTransportReady: true,
  kicked: false,
  parkedText: "  Hi\nthere  ",
  pendingSendText: null,
  status: "ready",
};

describe("decidePendingHostMessageSubmit", () => {
  it("submits the exact parked message once the host is idle", () => {
    expect(decidePendingHostMessageSubmit(parked)).toEqual({
      text: "  Hi\nthere  ",
      type: "submit",
    });
  });

  it("waits until transport and status are ready", () => {
    expect(
      decidePendingHostMessageSubmit({
        ...parked,
        isTransportReady: false,
      })
    ).toEqual({ type: "wait" });
    expect(
      decidePendingHostMessageSubmit({ ...parked, status: "error" })
    ).toEqual({ type: "wait" });
  });

  it("waits after a kick until the exact text is in the transcript", () => {
    expect(decidePendingHostMessageSubmit({ ...parked, kicked: true })).toEqual(
      { type: "wait" }
    );
  });

  it("does not clear the park because an unrelated send is in flight", () => {
    expect(
      decidePendingHostMessageSubmit({
        ...parked,
        pendingSendText: "other",
        status: "submitted",
      })
    ).toEqual({ type: "wait" });
  });

  it("completes only after transcript delivery", () => {
    expect(
      decidePendingHostMessageSubmit({
        ...parked,
        delivered: true,
        kicked: true,
        pendingSendText: parked.parkedText,
        status: "submitted",
      })
    ).toEqual({ type: "complete" });
  });

  it("waits while the bound thread is hydrating", () => {
    expect(
      decidePendingHostMessageSubmit({
        ...parked,
        isLoadingMessages: true,
      })
    ).toEqual({ type: "wait" });
  });

  it("idles without a non-whitespace message", () => {
    expect(
      decidePendingHostMessageSubmit({ ...parked, parkedText: "  " })
    ).toEqual({ type: "idle" });
  });
});

describe("pendingHostMessageDelivered", () => {
  it("matches exact user text without trimming it", () => {
    expect(
      pendingHostMessageDelivered("  Hi\nthere  ", [
        {
          parts: [{ text: "  Hi\nthere  ", type: "text" }],
          role: "user",
        },
      ])
    ).toBe(true);
    expect(
      pendingHostMessageDelivered("  Hi\nthere  ", [
        { parts: [{ text: "Hi\nthere", type: "text" }], role: "user" },
      ])
    ).toBe(false);
    expect(pendingHostMessageDelivered("Hi", [])).toBe(false);
  });
});
