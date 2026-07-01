/**
 * Contacts copilot contribution for the app-wide provider.
 */

import type { UiCopilotContribution } from "@engenty/ui-plugin-sdk";
import { contactUpdateSchema } from "../src/schema/zod.js";
import {
  addContactRole,
  type ContactUpdateInput,
  removeContactRole,
  updateContact,
} from "./api.js";
import { CONTACTS_MANAGER_AGENT_ID } from "./copilot-context.js";
import { getContactsDraftApplyHandler } from "./copilot-draft-bridge.js";
import { contactKeys } from "./queries.js";

const FIXED_ROLES = ["client", "partner", "supplier", "team"] as const;

function isFixedRole(role: string): role is (typeof FIXED_ROLES)[number] {
  return FIXED_ROLES.includes(role as (typeof FIXED_ROLES)[number]);
}

function coerceSuggestionScalar(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : null;
  }
  if (typeof value === "string") {
    return value;
  }
  return null;
}

/** Normalize + validate PATCH keys so gateway Zod accepts copilot suggestion payloads. */
function buildValidatedContactEntityPatch(
  patch: Record<string, string | null>
): Record<string, unknown> {
  const coerced: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(patch)) {
    const v = coerceSuggestionScalar(raw);
    if (key === "registration_number" && v != null) {
      const t = v.trim();
      coerced[key] = t.length > 64 ? t.slice(0, 64) : t;
      continue;
    }
    if (v === null) {
      coerced[key] = null;
    } else {
      const t = v.trim();
      coerced[key] = t === "" ? null : t;
    }
  }
  const validated: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(coerced)) {
    const one = contactUpdateSchema.safeParse({ [key]: val });
    if (one.success && key in (one.data as object)) {
      validated[key] = (one.data as Record<string, unknown>)[key];
    }
  }
  return validated;
}

export async function applyContactsSuggestions(
  patch: Record<string, string | null>,
  context: { scope: Record<string, unknown> }
) {
  const entityId = context.scope?.entityId;
  if (typeof entityId !== "string" || entityId.length === 0) {
    throw new Error("No contact id in current context.");
  }
  const ROLE_FIELD_PREFIX = "add_role_";
  const entityPatch: Record<string, string | null> = {};
  const rolesToAdd: string[] = [];
  const rolesToRemove: string[] = [];

  for (const [key, val] of Object.entries(patch)) {
    if (key.startsWith(ROLE_FIELD_PREFIX)) {
      const role = key.slice(ROLE_FIELD_PREFIX.length);
      if (isFixedRole(role) && (val === "true" || val === "1")) {
        rolesToAdd.push(role);
      }
    } else if (key.startsWith("remove_role_")) {
      const role = key.slice("remove_role_".length);
      if (isFixedRole(role) && (val === "true" || val === "1")) {
        rolesToRemove.push(role);
      }
    } else {
      entityPatch[key] = val;
    }
  }

  const validatedEntityPatch = buildValidatedContactEntityPatch(entityPatch);
  if (Object.keys(validatedEntityPatch).length > 0) {
    await updateContact(entityId, validatedEntityPatch as ContactUpdateInput);
  }
  for (const role of rolesToAdd) {
    await addContactRole(entityId, role);
  }
  for (const role of rolesToRemove) {
    await removeContactRole(entityId, role);
  }
}

function invalidateContactCopilotQueries({
  queryClient,
  scope,
}: Parameters<NonNullable<UiCopilotContribution["onAssistantTurnFinish"]>>[0]) {
  const entityId = scope.entityId;
  if (typeof entityId === "string" && entityId.length > 0) {
    void queryClient.invalidateQueries({
      queryKey: contactKeys.detail(entityId),
    });
  }
  void queryClient.invalidateQueries({ queryKey: contactKeys.all });
}

export const contactsCopilotContribution: UiCopilotContribution = {
  moduleId: "contacts",
  routeKey: "chat",
  requestedAgentId: CONTACTS_MANAGER_AGENT_ID,
  matches: (ctx) => {
    const currentModule = ctx.scope?.currentModule;
    const entityId = ctx.scope?.entityId;
    return currentModule === "contacts" && typeof entityId === "string";
  },
  resolveApplySuggestions: () => getContactsDraftApplyHandler(),
  applySuggestions: applyContactsSuggestions,
  onApplySuccess: invalidateContactCopilotQueries,
  onAssistantTurnFinish: invalidateContactCopilotQueries,
};
