import { describe, expect, it } from "vitest";
import { screenChatAttachment } from "./chat-attachment-screen.js";

const PE = [0x4d, 0x5a, 0x90, 0x00];
const ZIP = [0x50, 0x4b, 0x03, 0x04];
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d];

function file(name: string, head: number[] | string): File {
  const body =
    typeof head === "string" ? head : new Uint8Array([...head, 0, 0, 0, 0]);
  return new File([body], name);
}

describe("screenChatAttachment", () => {
  it("attaches ordinary documents, including Office files that are ZIPs inside", async () => {
    expect(await screenChatAttachment(file("clients.csv", "a;b\n1;2"))).toEqual(
      { kind: "ok" }
    );
    expect(await screenChatAttachment(file("offer.pdf", PDF))).toEqual({
      kind: "ok",
    });
    expect(await screenChatAttachment(file("list.xlsx", ZIP))).toEqual({
      kind: "ok",
    });
  });

  it("blocks programs by name and by content, whatever they are called", async () => {
    expect(await screenChatAttachment(file("setup.exe", "x"))).toEqual({
      kind: "blocked",
      reason: "executable",
    });
    expect(await screenChatAttachment(file("invoice.pdf", PE))).toEqual({
      kind: "blocked",
      reason: "executable",
    });
  });

  it("blocks an empty file", async () => {
    expect(await screenChatAttachment(new File([], "empty.csv"))).toEqual({
      kind: "blocked",
      reason: "empty",
    });
  });

  it("asks before attaching archives, macro files and files that are not what their name says", async () => {
    expect(await screenChatAttachment(file("export.zip", ZIP))).toEqual({
      kind: "ask",
      reason: "archive",
    });
    expect(await screenChatAttachment(file("budget.xlsm", ZIP))).toEqual({
      kind: "ask",
      reason: "macro",
    });
    expect(await screenChatAttachment(file("clients.csv", ZIP))).toEqual({
      kind: "ask",
      reason: "mismatch",
    });
  });
});
