import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MISSING_SPACE_POLICY_ALLOWLIST,
  spacePlacedOperationsMissingPolicy as sdkMissingPolicy,
} from "@engenty/plugin-sdk";
import { afterAll, describe, expect, it } from "vitest";
// @ts-expect-error -- plain .mjs guardrail, no type declarations
import {
  catalogDescriptionCallsOutputData,
  checkAiSpaceAuthoring,
  collectModuleOperations,
  MODULE_AI_RECORD_SCOPE_ASSERTIONS,
  PACKAGE_10_IN_FLIGHT_MODULE_IDS,
  readMissingPolicyAllowlist,
  searchOperationId,
  spacePlacedOperationsMissingPolicy,
} from "./ai-space-authoring.mjs";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

describe("catalogDescriptionCallsOutputData", () => {
  it("allows the catalog-only disclaimer", () => {
    expect(
      catalogDescriptionCallsOutputData(
        "Catalog discovery only; these are operation contracts, not app records."
      )
    ).toBe(false);
    expect(
      catalogDescriptionCallsOutputData(
        "This is API/tool discovery only; it does not fetch app data or app records."
      )
    ).toBe(false);
  });

  it("flags a description that calls catalog output data", () => {
    expect(
      catalogDescriptionCallsOutputData(
        "Search the catalog. These are data about the tenant's projects."
      )
    ).toBe(true);
    expect(
      catalogDescriptionCallsOutputData("engenty_tools_search returns data.")
    ).toBe(true);
  });
});

describe("searchOperationId", () => {
  it("matches plugin-sdk dotted-to-snake search ids", () => {
    expect(searchOperationId("contacts", "contact")).toBe(
      "contacts_contact_search"
    );
    expect(searchOperationId("knowledge-base", "article")).toBe(
      "knowledge_base_article_search"
    );
  });
});

describe("spacePlacedOperationsMissingPolicy (aligned with plugin-sdk)", () => {
  it("keeps the shipped allowlist empty", () => {
    expect(MISSING_SPACE_POLICY_ALLOWLIST).toEqual([]);
    expect(readMissingPolicyAllowlist(repoRoot)).toEqual([]);
  });

  it("agrees with the plugin-sdk reporter", () => {
    const operations = [
      {
        moduleId: "projects",
        operationId: "projects_list",
        pluginPlacement: "space" as const,
      },
      {
        moduleId: "projects",
        operationId: "projects_create",
        pluginPlacement: "space" as const,
        spacePolicy: { kind: "space_owned" as const },
      },
      {
        moduleId: "core",
        operationId: "core_ping",
        pluginPlacement: "global" as const,
      },
    ];
    expect(spacePlacedOperationsMissingPolicy(operations)).toEqual(
      sdkMissingPolicy(operations)
    );
    expect(spacePlacedOperationsMissingPolicy(operations)).toEqual([
      { moduleId: "projects", operationId: "projects_list" },
    ]);
  });
});

describe("checkAiSpaceAuthoring: fixture tree", () => {
  const root = mkdtempSync(join(tmpdir(), "ai-space-authoring-"));

  function write(relPath: string, contents: string): void {
    const full = join(root, relPath);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, contents);
  }

  write(
    "scripts/publish-open.sh",
    'CLOSED_PREFIXES=(\n  "modules/time-tracking"\n)\n'
  );
  write(
    "packages/plugin-sdk/src/space-policy.ts",
    "export const MISSING_SPACE_POLICY_ALLOWLIST: readonly { operationId: string; owner: string; removalTask: string; }[] = [];\n"
  );

  write(
    "modules/widgets/engenty.plugin.json",
    JSON.stringify({ id: "widgets", placement: "space" })
  );
  write(
    "modules/widgets/src/ops.ts",
    [
      "export function register(api: { registerOperation: (op: object) => void }) {",
      "  api.registerOperation({",
      '    operationId: "widgets_list",',
      "    inputSchema: z.object({ page: z.number() }),",
      "    handler: async () => [],",
      "  });",
      "  api.registerOperation({",
      '    operationId: "widgets_create",',
      '    spacePolicy: { kind: "space_owned" },',
      "    inputSchema: z.object({ title: z.string() }),",
      "    handler: async () => ({}),",
      "  });",
      "  api.registerOperation({",
      '    operationId: "widgets_ok_list",',
      '    spacePolicy: { kind: "space_owned" },',
      "    inputSchema: z.object({ space_id: z.string().uuid().optional() }),",
      "    handler: async () => [],",
      "  });",
      "}",
    ].join("\n")
  );
  write(
    "modules/widgets/ai/agents/widgets.bot/agent.json",
    JSON.stringify({
      id: "widgets.bot",
      skills: ["foreign-playbook", "widgets-own"],
    })
  );
  write(
    "modules/widgets/ai/skills/widgets-own/SKILL.md",
    "---\nname: widgets-own\n---\n# Own\n"
  );
  write(
    "modules/widgets/ai/tools/widgets-catalog-tool.ts",
    [
      'export const WIDGETS_CATALOG_TOOL_ID = "widgets_catalog_search";',
      "export const tool = {",
      '  id: "widgets_catalog_search",',
      '  description: "Catalog search that returns data about widget records.",',
      "};",
    ].join("\n")
  );

  write(
    "modules/knowledge-base/engenty.plugin.json",
    JSON.stringify({ id: "knowledge-base", placement: "space" })
  );
  write(
    "modules/knowledge-base/src/ops.ts",
    [
      "export function register(api: { registerOperation: (op: object) => void }) {",
      "  api.registerOperation({",
      '    operationId: "kb_list",',
      "    handler: async () => [],",
      "  });",
      "}",
    ].join("\n")
  );

  write(
    "modules/contacts/engenty.plugin.json",
    JSON.stringify({ id: "contacts", placement: "space" })
  );
  write(
    "modules/contacts/src/ops.ts",
    [
      "export function register(api: { registerOperation: (op: object) => void }) {",
      "  api.registerOperation({",
      '    operationId: "contacts_list",',
      '    spacePolicy: { kind: "tenant_shared" },',
      "    handler: async () => [],",
      "  });",
      "}",
    ].join("\n")
  );
  write(
    "modules/contacts/src/dal/contacts-retrieval-source.ts",
    [
      "export const source = {",
      '  module_id: "contacts",',
      "  operation: {",
      '    entityName: "contact",',
      '    spacePolicy: { kind: "tenant_shared" },',
      "  },",
      "};",
    ].join("\n")
  );

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const result = checkAiSpaceAuthoring(root);

  it("fails OPEN Space-placed operations that omit spacePolicy", () => {
    expect(
      result.errors.some((row: string) => row.includes("widgets_list"))
    ).toBe(true);
  });

  it("does not fail Package 10 CLOSED modules; lists them as in-flight", () => {
    expect(
      result.errors.some((row: string) => row.includes("knowledge-base"))
    ).toBe(false);
    expect(result.inFlight.some((row: string) => row.includes("kb_list"))).toBe(
      true
    );
    expect(PACKAGE_10_IN_FLIGHT_MODULE_IDS.has("knowledge-base")).toBe(true);
  });

  it("fails a preferred skill that is not owned by the agent module", () => {
    expect(
      result.errors.some((row: string) => row.includes("foreign-playbook"))
    ).toBe(true);
    expect(
      result.errors.some((row: string) => row.includes("widgets-own"))
    ).toBe(false);
  });

  it("fails a catalog tool description that calls output data", () => {
    expect(
      result.errors.some((row: string) =>
        row.includes('calls catalog output "data"')
      )
    ).toBe(true);
  });

  it("fails space_owned list/create whose schema cannot accept a Space", () => {
    expect(
      result.errors.some((row: string) => row.includes("widgets_create"))
    ).toBe(true);
    expect(
      result.errors.some((row: string) => row.includes("widgets_ok_list"))
    ).toBe(false);
  });

  it("collects synthesized search ops with declared policy", () => {
    const ops = collectModuleOperations(root);
    expect(
      ops.some(
        (op: { operationId: string; spacePolicy?: { kind: string } }) =>
          op.operationId === "contacts_contact_search" &&
          op.spacePolicy?.kind === "tenant_shared"
      )
    ).toBe(true);
  });
});

describe("checkAiSpaceAuthoring: repo", () => {
  const result = checkAiSpaceAuthoring(repoRoot);

  it("does not fail OPEN module authoring in this worktree", () => {
    expect(result.errors).toEqual([]);
  });

  it("keeps OPEN record-scope assertions pointed at real surfaces", () => {
    expect(MODULE_AI_RECORD_SCOPE_ASSERTIONS.length).toBeGreaterThan(0);
  });
});
