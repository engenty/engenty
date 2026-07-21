import { describe, expect, it } from "vitest";
import { maskSecretValue, primarySecretValue } from "./secret-kinds.js";

describe("primarySecretValue", () => {
  it("prefers password for username_password", () => {
    expect(
      primarySecretValue("username_password", {
        username: "ada",
        password: "hunter2",
      })
    ).toBe("hunter2");
  });

  it("reads api key value aliases", () => {
    expect(primarySecretValue("api_key", { value: "sk-abc" })).toBe("sk-abc");
    expect(primarySecretValue("api_key", { token: "tok" })).toBe("tok");
  });

  it("reads first key_list entry", () => {
    expect(
      primarySecretValue("key_list", {
        keys: [{ name: "a", value: "one" }],
      })
    ).toBe("one");
  });
});

describe("maskSecretValue", () => {
  it("masks with first and last characters", () => {
    expect(maskSecretValue("secret")).toBe("s…t");
    expect(maskSecretValue("ab")).toBe("a…b");
    expect(maskSecretValue("x")).toBe("x…");
  });
});
