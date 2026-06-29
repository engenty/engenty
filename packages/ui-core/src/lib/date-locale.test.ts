import { describe, expect, it } from "vitest";
import { resolveDateFnsLocale, resolveDayPickerLocale } from "./date-locale.js";

describe("resolveDayPickerLocale", () => {
  it("uses German locale with Monday as first weekday", () => {
    const locale = resolveDayPickerLocale("de");
    expect(locale.code).toBe("de");
    expect(locale.options?.weekStartsOn).toBe(1);
  });

  it("uses English locale for non-German languages", () => {
    const locale = resolveDayPickerLocale("en");
    expect(locale.code).toBe("en-US");
  });
});

describe("resolveDateFnsLocale", () => {
  it("returns German date-fns locale for de", () => {
    expect(resolveDateFnsLocale("de-AT").code).toBe("de");
  });

  it("returns English date-fns locale for en", () => {
    expect(resolveDateFnsLocale("en").code).toBe("en-US");
  });
});
