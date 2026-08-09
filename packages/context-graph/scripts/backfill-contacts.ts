// One-shot tenant backfill from `module_contacts` into the context graph.
//
// Usage:
//   pnpm --filter @engenty/context-graph tsx scripts/backfill-contacts.ts <tenant-id>
//
// Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from the environment
// (mirror `__tests__/setup-env.ts` for local dev). Idempotent: re-running
// just re-upserts on the canonical `(module=contacts, entity=contact, id)`
// external ref + the `(tenant_id, type, subject_id, object_id)` edge key.

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createContextGraphRepoSupabase } from "../src/dal/supabase.js";
import { createOntologyRegistry } from "../src/registry.js";
import { createContextGraphServerApi } from "../src/server-api.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const tenantId = process.argv[2];

if (!(SUPABASE_URL && SERVICE_KEY && tenantId)) {
  process.stderr.write(
    "usage: backfill-contacts <tenant-id>\n" +
      "  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.\n"
  );
  process.exit(2);
}

const passthroughAttrs = z.record(z.string(), z.unknown());

async function main(): Promise<void> {
  const supabase = createClient(SUPABASE_URL!, SERVICE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const registry = createOntologyRegistry();
  registry.registerSchema({
    moduleId: "contacts",
    entityTypes: [
      {
        id: "contacts.person",
        displayName: "Person",
        attributesSchema: passthroughAttrs,
      },
      {
        id: "contacts.organisation",
        displayName: "Organisation",
        attributesSchema: passthroughAttrs,
      },
    ],
    edgeTypes: [
      {
        id: "contacts_works_at",
        displayName: "Works at",
        subjectTypes: ["contacts.person"],
        objectTypes: ["contacts.organisation"],
        attributesSchema: passthroughAttrs,
      },
      {
        id: "contacts_member_of",
        displayName: "Member of",
        subjectTypes: ["contacts.person", "contacts.organisation"],
        objectTypes: ["contacts.organisation"],
        attributesSchema: passthroughAttrs,
      },
      {
        id: "contacts_client_of",
        displayName: "Client of",
        subjectTypes: ["contacts.person", "contacts.organisation"],
        objectTypes: ["contacts.person", "contacts.organisation"],
        attributesSchema: passthroughAttrs,
      },
    ],
  });
  const repo = createContextGraphRepoSupabase(supabase);
  const api = createContextGraphServerApi({ registry, repo });

  const { data: contactRows, error: contactErr } = await supabase
    .schema("module_contacts")
    .from("contacts")
    .select("id, type, display_name, notes")
    .eq("tenant_id", tenantId)
    .eq("scope_id", "default");
  if (contactErr) {
    throw new Error(`contacts query: ${contactErr.message}`);
  }

  let contactsCount = 0;
  for (const row of contactRows ?? []) {
    const r = row as {
      id: string;
      type: "organisation" | "person";
      display_name: string | null;
      notes: string | null;
    };
    await api.upsertEntity({
      tenantId,
      type: r.type === "person" ? "contacts.person" : "contacts.organisation",
      externalRef: { module: "contacts", entity: "contact", id: r.id },
      name: r.display_name,
      attributes: { display_name: r.display_name, notes: r.notes },
    });
    contactsCount++;
  }

  const { data: relRows, error: relErr } = await supabase
    .schema("module_contacts")
    .from("contact_relations")
    .select("from_contact_id, to_contact_id, relation_type")
    .eq("tenant_id", tenantId)
    .eq("scope_id", "default");
  if (relErr) {
    throw new Error(`contact_relations query: ${relErr.message}`);
  }

  let edgesCount = 0;
  for (const row of relRows ?? []) {
    const r = row as {
      from_contact_id: string;
      to_contact_id: string;
      relation_type: "client_of" | "member_of" | "works_at";
    };
    const subject = await api.getEntity({
      tenantId,
      externalRef: {
        module: "contacts",
        entity: "contact",
        id: r.from_contact_id,
      },
    });
    const object = await api.getEntity({
      tenantId,
      externalRef: {
        module: "contacts",
        entity: "contact",
        id: r.to_contact_id,
      },
    });
    if (!(subject && object)) {
      continue;
    }
    await api.upsertEdge({
      tenantId,
      type: `contacts.${r.relation_type}`,
      subjectId: subject.id,
      objectId: object.id,
      attributes: {},
    });
    edgesCount++;
  }

  process.stdout.write(
    `backfill complete: ${contactsCount} entities, ${edgesCount} edges (tenant=${tenantId})\n`
  );
}

main().catch((err) => {
  process.stderr.write(
    `backfill failed: ${err instanceof Error ? err.message : String(err)}\n`
  );
  process.exit(1);
});
