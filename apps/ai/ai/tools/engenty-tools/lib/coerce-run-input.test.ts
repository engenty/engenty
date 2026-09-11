import { describe, expect, it } from "vitest";
import { coerceRunInput } from "./coerce-run-input.js";

describe("coerceRunInput", () => {
  it("keeps a nested input object", () => {
    expect(
      coerceRunInput({
        id: "contacts_create",
        input: {
          display_name: "SFG",
          type: "organisation",
          website: "https://www.sfg.at/",
        },
      })
    ).toEqual({
      id: "contacts_create",
      input: {
        display_name: "SFG",
        type: "organisation",
        website: "https://www.sfg.at/",
      },
    });
  });

  it("lifts fields flattened beside id", () => {
    expect(
      coerceRunInput({
        display_name: "SFG",
        id: "contacts_create",
        type: "organisation",
        website: "https://www.sfg.at/",
      })
    ).toEqual({
      id: "contacts_create",
      input: {
        display_name: "SFG",
        type: "organisation",
        website: "https://www.sfg.at/",
      },
    });
  });

  it("parses a JSON string in input", () => {
    expect(
      coerceRunInput({
        id: "contacts_create",
        input: '{"type":"organisation","display_name":"SFG"}',
      })
    ).toEqual({
      id: "contacts_create",
      input: { display_name: "SFG", type: "organisation" },
    });
  });

  it("parses JSON from input_json when input is empty", () => {
    expect(
      coerceRunInput({
        id: "contacts_create",
        input: {},
        input_json: '{"type":"organisation","display_name":"SFG"}',
      })
    ).toEqual({
      id: "contacts_create",
      input: { display_name: "SFG", type: "organisation" },
    });
  });

  it("leaves a truly empty call empty", () => {
    expect(coerceRunInput({ id: "contacts_create", input: {} })).toEqual({
      id: "contacts_create",
      input: {},
    });
  });
});
