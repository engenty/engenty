// Published wizards are slash commands: `/<title>` targets the STORED row,
// carries `surface: "wizard"` so the client presses it without an agent turn,
// and admits the input schema's properties as args.
import { describe, expect, it, vi } from "vitest";

const rows = [
  {
    current_version: 3,
    description: "Ein Angebot Schritt für Schritt",
    id: "0b1f6a3e-0000-4000-8000-000000000001",
    module_id: "offers",
    name: "offers.create",
    status: "active",
    surface: "wizard",
    title: "Angebot erstellen",
  },
  {
    current_version: null,
    description: null,
    id: "0b1f6a3e-0000-4000-8000-000000000002",
    module_id: null,
    name: "unpublished",
    status: "active",
    surface: "wizard",
    title: "Noch nicht fertig",
  },
];

vi.mock("../index.js", () => ({
  createWorkflowStoreFromEnv: () => ({
    getCurrent: async ({ id }: { id: string }) =>
      id === rows[0]?.id
        ? {
            graph: rows[0],
            version: {
              input_schema: {
                properties: {
                  contact: { "x-ref": "contacts:contact" },
                  tone: { enum: ["formal", "casual"] },
                  scope: { title: "Umfang", type: "string" },
                },
                required: ["contact"],
                type: "object",
              },
            },
          }
        : null,
    list: async (input: { surface?: string; status?: string }) =>
      input.surface === "wizard" && input.status === "active" ? rows : [],
  }),
}));

import { commandTokenFor, listAllChatCommands } from "../chat-commands.js";

describe("commandTokenFor", () => {
  it("slugs a title into a command token", () => {
    expect(commandTokenFor("Angebot erstellen")).toBe("angebot-erstellen");
    expect(commandTokenFor("  Réunion: Protokoll!  ")).toBe(
      "reunion-protokoll"
    );
  });
});

describe("listAllChatCommands — wizards", () => {
  it("lists every published wizard of the tenant as a workflow command", async () => {
    const commands = await listAllChatCommands(undefined, "tenant-a");
    const wizard = commands.find((c) => c.command === "angebot-erstellen");
    expect(wizard).toMatchObject({
      id: `workflow:${rows[0]?.id}`,
      kind: "workflow",
      label: "Angebot erstellen",
      module_id: "offers",
      surface: "wizard",
      workflow_id: rows[0]?.id,
    });
    expect(wizard?.args).toEqual([
      {
        name: "contact",
        ref_entity: "contacts:contact",
        required: true,
        type: "ref",
      },
      { name: "tone", options: ["formal", "casual"], type: "enum" },
      { label: "Umfang", name: "scope", type: "string" },
    ]);
    // An unpublished wizard is not a command yet.
    expect(commands.some((c) => c.command === "noch-nicht-fertig")).toBe(false);
  });

  it("lists no wizard without a tenant", async () => {
    const commands = await listAllChatCommands(undefined);
    expect(commands.some((c) => c.surface === "wizard")).toBe(false);
  });
});
