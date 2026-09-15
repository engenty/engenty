/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatKindBadge } from "./chat-kind-badge.js";

vi.mock("@engenty/i18n/ui", () => ({
  useTranslation: () => ({
    t: (key: string, vars?: { space?: string }) =>
      key === "chatKind.desk.labelWithSpace"
        ? `Shared desk · ${vars?.space}`
        : key,
  }),
}));

describe("ChatKindBadge", () => {
  afterEach(() => {
    cleanup();
  });

  it("does not put the Space name in the desk chip", () => {
    render(<ChatKindBadge kind="desk" spaceName="test eins" />);
    expect(screen.queryByText(/test eins/)).toBeNull();
    expect(screen.getByText("chatKind.desk.label")).toBeTruthy();
  });
});
