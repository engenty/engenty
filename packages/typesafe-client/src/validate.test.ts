import { describe, expect, it } from "vitest";
import type { Answer } from "./types.js";
import { validateChoiceAnswer } from "./validate.js";

const ok: Answer = {
  choice: "CLICK",
  confidence: 0.9,
  probabilities: { CLICK: 0.9, DONE: 0.1 },
  type: "choice",
};

describe("validateChoiceAnswer", () => {
  it("accepts a well-formed answer over exactly the offered ids", () => {
    expect(validateChoiceAnswer(ok, ["CLICK", "DONE"])).toBe(ok);
  });

  it("rejects a missing head", () => {
    expect(() => validateChoiceAnswer(undefined, ["CLICK"])).toThrow(
      /typesafe_invalid_choice/
    );
  });

  it("rejects a choice that was not offered", () => {
    expect(() =>
      validateChoiceAnswer({ ...ok, choice: "TYPE_TEXT" }, ["CLICK", "DONE"])
    ).toThrow(/typesafe_invalid_choice/);
  });

  it("rejects a distribution over different ids than offered", () => {
    expect(() => validateChoiceAnswer(ok, ["CLICK", "DONE", "WAIT"])).toThrow();
    expect(() =>
      validateChoiceAnswer(
        { ...ok, probabilities: { CLICK: 0.9, WAIT: 0.1 } },
        ["CLICK", "DONE"]
      )
    ).toThrow();
  });

  it("rejects probabilities that do not sum to one", () => {
    expect(() =>
      validateChoiceAnswer(
        { ...ok, probabilities: { CLICK: 0.9, DONE: 0.5 } },
        ["CLICK", "DONE"]
      )
    ).toThrow();
  });

  it("rejects a choice that is not the argmax", () => {
    expect(() =>
      validateChoiceAnswer({ ...ok, choice: "DONE" }, ["CLICK", "DONE"])
    ).toThrow();
  });

  it("rejects non-finite or out-of-range numbers", () => {
    expect(() =>
      validateChoiceAnswer(
        { ...ok, probabilities: { CLICK: Number.NaN, DONE: 0.1 } },
        ["CLICK", "DONE"]
      )
    ).toThrow();
    expect(() =>
      validateChoiceAnswer({ ...ok, confidence: 1.5 }, ["CLICK", "DONE"])
    ).toThrow();
  });

  it("rejects an answer of another type", () => {
    expect(() =>
      validateChoiceAnswer({ noul: 0.4, type: "noul" }, ["CLICK"])
    ).toThrow();
  });
});
