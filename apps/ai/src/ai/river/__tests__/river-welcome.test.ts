import { describe, expect, it, vi } from "vitest";
import { COPILOT_WELCOME_TEXT, copilotWelcomeText } from "../river-welcome.js";

describe("copilotWelcomeText", () => {
  it("asks the model for any language but English", async () => {
    const translate = vi.fn().mockResolvedValue("Hallo! Ich bin dein Copilot.");
    expect(await copilotWelcomeText({ language: "de-AT", translate })).toBe(
      "Hallo! Ich bin dein Copilot."
    );
    expect(translate).toHaveBeenCalledWith(
      expect.objectContaining({ language: "de-AT", text: COPILOT_WELCOME_TEXT })
    );

    translate.mockClear();
    expect(await copilotWelcomeText({ language: "en-GB", translate })).toBe(
      COPILOT_WELCOME_TEXT
    );
    expect(await copilotWelcomeText({ language: undefined, translate })).toBe(
      COPILOT_WELCOME_TEXT
    );
    expect(translate).not.toHaveBeenCalled();
  });

  it("keeps the English when the model fails or answers nothing", async () => {
    expect(
      await copilotWelcomeText({
        language: "fr",
        translate: vi.fn().mockRejectedValue(new Error("gateway down")),
      })
    ).toBe(COPILOT_WELCOME_TEXT);
    expect(
      await copilotWelcomeText({
        language: "fr",
        translate: vi.fn().mockResolvedValue("  "),
      })
    ).toBe(COPILOT_WELCOME_TEXT);
  });
});
