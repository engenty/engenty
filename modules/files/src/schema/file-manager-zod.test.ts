import { describe, expect, it } from "vitest";
import { encodeConnectorNodeId } from "../sources/connector-ref.js";
import {
  fileSpaceNodeIdSchema,
  isFileSpaceNodeId,
} from "./file-manager-zod.js";

const FOLDER_UUID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const CONNECTION = "9b2f1c44-0000-4000-8000-000000000001";

describe("fileSpaceNodeIdSchema", () => {
  it("accepts a native folder uuid", () => {
    expect(isFileSpaceNodeId(FOLDER_UUID)).toBe(true);
    expect(fileSpaceNodeIdSchema.parse(FOLDER_UUID)).toBe(FOLDER_UUID);
  });

  it("accepts a virtual connector folder id so nested mounts can be listed", () => {
    const id = encodeConnectorNodeId(CONNECTION, ".agents");
    expect(isFileSpaceNodeId(id)).toBe(true);
    expect(fileSpaceNodeIdSchema.parse(id)).toBe(id);
  });

  it("accepts a connector file at the mount root (empty parent segment)", () => {
    const id = encodeConnectorNodeId(CONNECTION, "index.md", "");
    expect(isFileSpaceNodeId(id)).toBe(true);
    expect(fileSpaceNodeIdSchema.parse(id)).toBe(id);
  });

  it("rejects an opaque string that is neither", () => {
    expect(isFileSpaceNodeId("not-a-node")).toBe(false);
    expect(() => fileSpaceNodeIdSchema.parse("not-a-node")).toThrow();
  });
});
