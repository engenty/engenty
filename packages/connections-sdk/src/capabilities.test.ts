// CON-02: one `module.connections.write` grant used to span Gmail-send,
// Slack-post and OneDrive-upload alike. These cover the scoping layer that
// splits it, and — just as importantly — that a principal who never asked for
// scoping is unaffected.

import { describe, expect, it } from "vitest";
import {
  connectorCapability,
  connectorCapabilityBase,
  connectorScopeAllows,
} from "./capabilities.js";

const GMAIL = "google-gmail";
const SLACK = "slack";

function allows(capabilities: string[], connectorId: string, group = "write") {
  return connectorScopeAllows({
    capabilities,
    connectorId,
    group: group as "read" | "write" | "destructive",
  });
}

describe("connectorCapability", () => {
  it("names the per-connector capability", () => {
    expect(connectorCapability("write", GMAIL)).toBe(
      "module.connections.write.google-gmail"
    );
    expect(connectorCapability("read", GMAIL)).toBe(
      "module.connections.read.google-gmail"
    );
  });

  it("folds destructive into write — a delete is not a separate grant", () => {
    expect(connectorCapabilityBase("destructive")).toBe(
      "module.connections.write"
    );
    expect(connectorCapability("destructive", GMAIL)).toBe(
      connectorCapability("write", GMAIL)
    );
  });
});

describe("connectorScopeAllows — the CON-02 split", () => {
  it("a gmail write grant does not authorize a slack write", () => {
    const caps = [
      "module.connections.read",
      "module.connections.write",
      connectorCapability("write", GMAIL),
    ];
    expect(allows(caps, GMAIL)).toBe(true);
    expect(allows(caps, SLACK)).toBe(false);
  });

  it("scopes destructive actions with the same grant", () => {
    const caps = [
      "module.connections.write",
      connectorCapability("write", GMAIL),
    ];
    expect(allows(caps, GMAIL, "destructive")).toBe(true);
    expect(allows(caps, SLACK, "destructive")).toBe(false);
  });

  it("names several connectors when the role does", () => {
    const caps = [
      "module.connections.write",
      connectorCapability("write", GMAIL),
      connectorCapability("write", SLACK),
    ];
    expect(allows(caps, GMAIL)).toBe(true);
    expect(allows(caps, SLACK)).toBe(true);
    expect(allows(caps, "onedrive")).toBe(false);
  });
});

describe("connectorScopeAllows — nothing that works today stops working", () => {
  it("leaves a broad grant unrestricted", () => {
    // The `connections.editor` bundle, unchanged. This is the case that must
    // never regress: every pre-CON-02 grant, token and custom role is here.
    const caps = ["module.connections.read", "module.connections.write"];
    for (const connector of [GMAIL, SLACK, "onedrive"]) {
      expect(allows(caps, connector)).toBe(true);
    }
  });

  it("leaves a tenant admin unrestricted", () => {
    for (const caps of [["*"], ["core.superadmin"]]) {
      expect(allows(caps, SLACK)).toBe(true);
    }
  });

  it("treats an explicit write.* as every connector", () => {
    const caps = ["module.connections.write", "module.connections.write.*"];
    expect(allows(caps, GMAIL)).toBe(true);
    expect(allows(caps, SLACK)).toBe(true);
  });

  it("scopes each group independently", () => {
    // Scoped for writes, unscoped for reads: naming a connector under `write`
    // must not silently restrict what the principal can read.
    const caps = [
      "module.connections.read",
      "module.connections.write",
      connectorCapability("write", GMAIL),
    ];
    expect(allows(caps, SLACK, "read")).toBe(true);
    expect(allows(caps, SLACK, "write")).toBe(false);
  });

  it("does not let a read scope leak into write authority", () => {
    const caps = [
      "module.connections.read",
      connectorCapability("read", GMAIL),
      "module.connections.write",
    ];
    expect(allows(caps, GMAIL, "read")).toBe(true);
    expect(allows(caps, SLACK, "read")).toBe(false);
    // No write scoping named, so writes stay broad.
    expect(allows(caps, SLACK, "write")).toBe(true);
  });
});
