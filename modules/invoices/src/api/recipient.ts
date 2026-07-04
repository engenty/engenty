import type {
  PluginAuthContext,
  PluginHttpRouteContext,
} from "@engenty/plugin-sdk";
import type { InvoiceRecipientSnapshot } from "../schema/types.js";

export interface RecipientLookup {
  hasOperation: (operationId: string) => boolean;
  invokeOperation: PluginHttpRouteContext["callGatewayMethod"];
}

interface EntityLike {
  address_city?: string | null;
  address_country?: string | null;
  address_street?: string | null;
  address_zip?: string | null;
  company_name?: string;
  display_name?: string;
  email?: string | null;
  id: string;
  legal_name?: string | null;
  phone?: string | null;
  tax_id?: string | null;
  type?: "organisation" | "person" | "company";
  vat_id?: string | null;
}

function entityToRecipientSnapshot(
  entity: EntityLike
): InvoiceRecipientSnapshot {
  const street = (entity.address_street ?? "").trim() || "—";
  const postalCode = (entity.address_zip ?? "").trim() || "—";
  const city = (entity.address_city ?? "").trim() || "—";
  const country = (entity.address_country ?? "").trim() || "—";
  const displayName =
    (entity.display_name ?? entity.company_name ?? "").trim() || "—";
  const isPerson = entity.type === "person" || entity.type === "individual";
  return {
    clientId: entity.id,
    kind: isPerson ? "individual" : "organization",
    displayName,
    legalName: (entity.legal_name ?? "").trim() || undefined,
    email: (entity.email ?? "").trim() || undefined,
    phone: (entity.phone ?? "").trim() || undefined,
    taxId: (entity.tax_id ?? "").trim() || undefined,
    vatId: (entity.vat_id ?? "").trim() || undefined,
    address: { street, postalCode, city, country },
    capturedAt: new Date().toISOString(),
  };
}

export async function resolveRecipientFromClientId(
  lookup: RecipientLookup,
  clientId: string,
  auth?: PluginAuthContext
) {
  const operationId = lookup.hasOperation("contacts_get")
    ? "contacts_get"
    : null;
  if (!(operationId && lookup.invokeOperation)) {
    return { clientId, recipientSnapshot: undefined };
  }

  const result = await lookup.invokeOperation(
    operationId,
    { id: clientId },
    { auth }
  );
  if (!result || typeof result !== "object") {
    throw new Error("Entity not found");
  }
  const entity = result as EntityLike;
  const recipientSnapshot = entityToRecipientSnapshot(entity);
  return {
    clientId,
    recipientSnapshot,
  };
}
