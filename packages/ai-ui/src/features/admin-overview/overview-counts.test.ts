import { describe, expect, it } from "vitest";
import {
  countActions,
  countSkills,
  countTools,
  countWorkforce,
  previewNames,
} from "./overview-counts";

describe("countWorkforce", () => {
  it("buckets agents by catalog group", () => {
    const counts = countWorkforce([
      { id: "engenty.copilot", name: "Copilot", role: "copilot" },
      { id: "engenty.coordinator", name: "Conductor", role: "coordinator" },
      {
        id: "contacts.manager",
        name: "CM",
        role: "specialist",
        source: "module",
      },
      { id: "kb.answers", name: "KB", role: "chat_surface" },
      { id: "faq", name: "FAQ", role: "external" },
      { id: "my-agent", name: "Mine", role: "specialist", source: "database" },
    ]);
    expect(counts).toEqual({
      chat_surfaces: 1,
      custom: 1,
      external: 1,
      leadership: 2,
      specialists: 1,
    });
  });

  it("returns zeros for an empty tenant", () => {
    expect(countWorkforce([])).toEqual({
      chat_surfaces: 0,
      custom: 0,
      external: 0,
      leadership: 0,
      specialists: 0,
    });
  });
});

describe("countSkills", () => {
  it("splits managed vs custom by tier", () => {
    expect(
      countSkills([
        { name: "a", tier: "managed" },
        { name: "b", tier: "custom" },
        { name: "c" },
      ])
    ).toEqual({ custom: 1, managed: 2, total: 3 });
  });
});

describe("countTools", () => {
  it("counts by derived source category", () => {
    expect(
      countTools([
        { id: "t1", name: "t1" },
        { id: "t2", name: "t2", engenty_mcp_app: "linear" },
        { id: "t3", name: "t3", source: "contacts" },
      ])
    ).toEqual({ custom: 1, mcp: 1, module: 1, total: 3 });
  });
});

describe("countActions", () => {
  it("splits shipped vs tenant-owned", () => {
    expect(
      countActions([
        { name: "a", owner_kind: "module" },
        { name: "b", owner_kind: "tenant" },
        { name: "c", owner_kind: "core" },
      ])
    ).toEqual({ custom: 1, shipped: 2, total: 3 });
  });
});

describe("previewNames", () => {
  it("returns at most the limit", () => {
    expect(
      previewNames([{ name: "a" }, { name: "b" }, { name: "c" }, { name: "d" }])
    ).toEqual(["a", "b", "c"]);
  });
});
