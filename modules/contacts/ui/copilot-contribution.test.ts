import { describe, expect, it, vi } from "vitest";
import { contactsCopilotContribution } from "./copilot-contribution.js";

describe("contactsCopilotContribution", () => {
  it("invalidates contact queries after an approved action and after assistant turns", async () => {
    const queryClient = {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
    };
    const args = {
      pathname: "/mdl/contacts/contact-1",
      queryClient,
      scope: { entityId: "contact-1" },
    };

    await contactsCopilotContribution.onApplySuccess?.(args);
    await contactsCopilotContribution.onAssistantTurnFinish?.(args);

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["contacts", "detail", "contact-1"],
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["contacts"],
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(4);
  });
});
