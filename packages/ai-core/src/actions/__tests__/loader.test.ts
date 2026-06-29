import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { loadActionDefinitionsFromDirectory } from "../loader.js";

const createdDirs: string[] = [];

describe("loadActionDefinitionsFromDirectory", () => {
  afterEach(() => {
    for (const dir of createdDirs.splice(0)) {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it("loads ACTION.md frontmatter and markdown body into action definitions", () => {
    const dir = mkdtempSync(join(tmpdir(), "engenty-action-loader-"));
    createdDirs.push(dir);
    const actionDir = join(dir, "search-contacts");
    mkdirSync(actionDir, { recursive: true });
    writeFileSync(
      join(actionDir, "ACTION.md"),
      `---
id: contacts.search-action
module_id: contacts
agent_id: contacts.manager
name: Search contacts
default_thread_mode: new
instruction_keys:
  - contacts.actions.search
skills: contacts-search
allowed-tools: searchContacts
input_schema_ref: contactsSearchActionInputSchema
context_type: null
---

# Search Contacts

- Searches existing contacts using structured filters.
`,
      "utf8"
    );

    const definitions = loadActionDefinitionsFromDirectory({
      actionsDir: dir,
      moduleId: "contacts",
      schemaReferences: {
        contactsSearchActionInputSchema: z.object({
          search: z.string().optional(),
        }),
      },
    });

    expect(definitions).toHaveLength(1);
    expect(definitions[0]?.id).toBe("contacts.search-action");
    expect(definitions[0]?.description).toBe(
      "Searches existing contacts using structured filters."
    );
    expect(definitions[0]?.prompt).toContain("# Search Contacts");
    expect(definitions[0]?.allowed_tools).toEqual(["searchContacts"]);
    expect(definitions[0]?.skills).toEqual(["contacts-search"]);
  });

  it("still loads legacy skill_keys YAML list", () => {
    const dir = mkdtempSync(join(tmpdir(), "engenty-action-loader-legacy-sk"));
    createdDirs.push(dir);
    const actionDir = join(dir, "legacy-action");
    mkdirSync(actionDir, { recursive: true });
    writeFileSync(
      join(actionDir, "ACTION.md"),
      `---
id: contacts.legacy-skills
module_id: contacts
agent_id: contacts.manager
name: Legacy skills
default_thread_mode: new
skill_keys:
  - contacts-search
input_schema_json:
  type: object
  additionalProperties: false
---

Body
`,
      "utf8"
    );

    const definitions = loadActionDefinitionsFromDirectory({
      actionsDir: dir,
      moduleId: "contacts",
    });

    expect(definitions[0]?.skills).toEqual(["contacts-search"]);
  });

  it("loads input_schema from input_schema_json (YAML) front matter", () => {
    const dir = mkdtempSync(join(tmpdir(), "engenty-action-loader-json-"));
    createdDirs.push(dir);
    const actionDir = join(dir, "enhance");
    mkdirSync(actionDir, { recursive: true });
    writeFileSync(
      join(actionDir, "ACTION.md"),
      `---
id: contacts.enhance-contact
module_id: contacts
agent_id: contacts.manager
name: Enhance
default_thread_mode: new
input_schema_json:
  description: Optional explicit contact id.
  type: object
  additionalProperties: false
  properties:
    id:
      description: Organisation contact id.
      type: string
      minLength: 1
---

Body
`,
      "utf8"
    );

    const definitions = loadActionDefinitionsFromDirectory({
      actionsDir: dir,
      moduleId: "contacts",
    });

    expect(definitions).toHaveLength(1);
    expect(definitions[0]?.input_schema_json?.properties).toEqual(
      expect.objectContaining({
        id: expect.objectContaining({
          description: "Organisation contact id.",
        }),
      })
    );
    expect(definitions[0]?.input_schema_json?.description).toBe(
      "Optional explicit contact id."
    );
    expect(definitions[0]?.input_schema.parse({})).toEqual({});
    expect(definitions[0]?.input_schema.parse({ id: "c1" })).toEqual({
      id: "c1",
    });
    expect(() =>
      definitions[0]?.input_schema.parse({
        fields: ["legal_name"],
        mode: "enhance",
      })
    ).toThrow();
  });
});
