import type { PluginAuthContext } from "@engenty/plugin-sdk";
import { createLogger } from "@engenty/telemetry";
import type { createContactRepoSupabase } from "../dal/supabase.js";

const logger = createLogger({ name: "contacts-helpers" });

export type ContactRepo = ReturnType<typeof createContactRepoSupabase>;
export type ContactRepoOrFactory =
  | ContactRepo
  | ((auth: PluginAuthContext) => ContactRepo);

export type GetRepoFn = (
  repoOrFactory: ContactRepoOrFactory,
  auth?: PluginAuthContext
) => ContactRepo;

export interface GatewayMethodCaller {
  hasOperation: (methodName: string) => boolean;
  invokeOperation: (
    methodName: string,
    input?: unknown,
    options?: { auth?: PluginAuthContext }
  ) => Promise<unknown | null>;
}

export function getRepo(
  repoOrFactory: ContactRepoOrFactory,
  auth?: PluginAuthContext
): ContactRepo {
  if (typeof repoOrFactory === "function") {
    if (!auth) {
      throw new Error("Auth context required for server-first repo");
    }
    return repoOrFactory(auth);
  }
  return repoOrFactory;
}

export async function countLinkedInvoices(
  gateway: GatewayMethodCaller,
  contactId: string,
  auth?: PluginAuthContext
): Promise<number | undefined> {
  if (!gateway.hasOperation("invoices_list_by_client")) {
    return;
  }
  try {
    const result = await gateway.invokeOperation(
      "invoices_list_by_client",
      { clientId: contactId },
      { auth }
    );
    if (!Array.isArray(result)) {
      return;
    }
    return result.length;
  } catch {
    // Linked-invoice count is optional enrichment; a failure here (e.g. the
    // caller lacks `module.invoices.read`, or invoices is disabled) must not
    // break loading the contact itself.
    return;
  }
}

export async function attachLinkedInvoiceCounts<T extends { id: string }>(
  gateway: GatewayMethodCaller,
  contacts: T[],
  auth?: PluginAuthContext
): Promise<(T & { linked_invoices_count?: number })[]> {
  if (contacts.length === 0) {
    return contacts;
  }
  if (gateway.hasOperation("invoices_count_by_client_ids")) {
    try {
      const result = await gateway.invokeOperation(
        "invoices_count_by_client_ids",
        { clientIds: contacts.map((c) => c.id) },
        { auth }
      );
      if (
        result &&
        typeof result === "object" &&
        !Array.isArray(result) &&
        result !== null
      ) {
        const map = result as Record<string, number>;
        return contacts.map((contact) => ({
          ...contact,
          linked_invoices_count: map[contact.id] ?? 0,
        }));
      }
    } catch (error) {
      // The batch op exists but failed. Falling through to the per-contact path
      // still renders the list, but it costs one query per contact — so say so
      // rather than degrading silently, which is how a batch-op regression
      // survives unnoticed as a slow page.
      logger.warn(
        "invoices_count_by_client_ids failed — falling back to per-contact counts",
        {
          contactCount: contacts.length,
          detail: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }
  return Promise.all(
    contacts.map(async (contact) => {
      const count = await countLinkedInvoices(gateway, contact.id, auth);
      return count === undefined
        ? contact
        : { ...contact, linked_invoices_count: count };
    })
  );
}

export const CONTACT_CREATE_DEFAULTS = {
  legal_name: null as string | null,
  contact_name: "",
  email: null as string | null,
  billing_email: null as string | null,
  phone: null as string | null,
  address_street: null as string | null,
  address_zip: null as string | null,
  address_city: null as string | null,
  address_country: null as string | null,
  address_info: null as string | null,
  vat_id: null as string | null,
  tax_id: null as string | null,
  registration_number: null as string | null,
  court_of_registration: null as string | null,
  legal_form: null as string | null,
  website_contact: null as string | null,
  website_impress: null as string | null,
  logo_url: null as string | null,
  reference_id: null as string | null,
  import_id: null as string | null,
  notes: null as string | null,
};
