import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CliApiError } from "../auth-sdk.js";
import { hintForError } from "../cli-errors.js";
import { readToolInput } from "./tools-input.js";

describe("readToolInput", () => {
  it("parses a JSON literal", async () => {
    await expect(readToolInput('{"a":1}')).resolves.toEqual({ a: 1 });
  });

  it("treats an empty value as {}", async () => {
    await expect(readToolInput("")).resolves.toEqual({});
  });

  it("reads @file inputs", async () => {
    const file = path.join(os.tmpdir(), `tool-input-${process.pid}.json`);
    fs.writeFileSync(file, '{"from":"file"}');
    await expect(readToolInput(`@${file}`)).resolves.toEqual({ from: "file" });
    fs.unlinkSync(file);
  });

  it("rejects invalid JSON with a helpful message", async () => {
    await expect(readToolInput("{nope")).rejects.toThrow(/not valid JSON/);
  });
});

describe("hintForError", () => {
  it("suggests login on 401", () => {
    expect(hintForError(new CliApiError("API 401: x", 401))).toMatch(
      /engenty auth login/
    );
  });

  it("suggests starting the API when unreachable", () => {
    expect(hintForError(new CliApiError("Cannot reach", 0))).toMatch(
      /pnpm dev:api/
    );
  });

  it("returns nothing for plain errors", () => {
    expect(hintForError(new Error("boom"))).toBeUndefined();
  });
});
