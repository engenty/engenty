import type { ImportFieldDefinition, PreviewColumn } from "@engenty/import";
import type {
  ClientOption,
  OwnerScope,
  ProjectOption,
  SecretCreateInput,
  SecretKind,
} from "../api.js";

export interface SecretImportContext {
  clients: ClientOption[];
  currentUserId: string;
  projects: ProjectOption[];
  tenantId: string;
}

function toNullable(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value.trim());
}

export function parseImportSecretKind(
  raw: string | undefined
): SecretKind | null {
  const v = raw?.trim().toLowerCase() ?? "";
  if (
    v === "username_password" ||
    v === "usernamepassword" ||
    v === "password" ||
    v === "login" ||
    v === "userpass" ||
    v === "benutzername" ||
    v === "passwort"
  ) {
    return "username_password";
  }
  if (
    v === "api_key" ||
    v === "apikey" ||
    v === "token" ||
    v === "api" ||
    v === "api-schlüssel" ||
    v === "apischlussel"
  ) {
    return "api_key";
  }
  if (
    v === "credit_card" ||
    v === "creditcard" ||
    v === "card" ||
    v === "kreditkarte"
  ) {
    return "credit_card";
  }
  if (
    v === "note" ||
    v === "secure_note" ||
    v === "securenote" ||
    v === "notiz"
  ) {
    return "note";
  }
  return null;
}

export function parseImportOwnerScope(
  raw: string | undefined
): OwnerScope | null {
  const v = raw?.trim().toLowerCase() ?? "";
  if (
    v === "user" ||
    v === "personal" ||
    v === "person" ||
    v === "persönlich" ||
    v === "persoenlich"
  ) {
    return "user";
  }
  if (
    v === "tenant" ||
    v === "workspace" ||
    v === "org" ||
    v === "organisation"
  ) {
    return "tenant";
  }
  if (v === "client" || v === "kunde" || v === "customer" || v === "company") {
    return "client";
  }
  if (v === "project" || v === "projekt") {
    return "project";
  }
  return null;
}

function resolveNamedOwner(
  name: string,
  scope: "client" | "project",
  ctx: SecretImportContext
): string | null {
  const lower = name.trim().toLowerCase();
  if (!lower) {
    return null;
  }
  if (scope === "client") {
    const match = ctx.clients.find(
      (client) => client.display_name.trim().toLowerCase() === lower
    );
    return match?.id ?? null;
  }
  const match = ctx.projects.find(
    (project) => project.title.trim().toLowerCase() === lower
  );
  return match?.id ?? null;
}

function resolveOwnerId(
  scope: OwnerScope,
  row: Record<string, string>,
  ctx: SecretImportContext
): string {
  if (scope === "user") {
    return ctx.currentUserId;
  }
  if (scope === "tenant") {
    return ctx.tenantId;
  }

  const explicitId = toNullable(row.owner_id);
  if (explicitId && isUuid(explicitId)) {
    return explicitId;
  }

  const ownerName =
    toNullable(row.owner_name) ??
    (scope === "client"
      ? toNullable(row.client_name)
      : toNullable(row.project_name));
  if (ownerName) {
    const resolved = resolveNamedOwner(ownerName, scope, ctx);
    if (resolved) {
      return resolved;
    }
  }

  throw new Error(
    scope === "client"
      ? "Client owner_id or matching client_name is required"
      : "Project owner_id or matching project_name is required"
  );
}

function buildPayload(
  kind: SecretKind,
  row: Record<string, string>
): Record<string, unknown> {
  switch (kind) {
    case "username_password": {
      const username = toNullable(row.username) ?? "";
      const password = toNullable(row.password) ?? "";
      if (!(username || password)) {
        throw new Error(
          "Username or password is required for this secret type"
        );
      }
      return { username, password };
    }
    case "api_key": {
      const value = toNullable(row.value) ?? toNullable(row.api_key);
      if (!value) {
        throw new Error("API key value is required");
      }
      return { value };
    }
    case "credit_card": {
      const number =
        toNullable(row.number) ?? toNullable(row.card_number) ?? "";
      const expiry =
        toNullable(row.expiry) ?? toNullable(row.card_expiry) ?? "";
      const cvv = toNullable(row.cvv) ?? toNullable(row.card_cvv) ?? "";
      if (!(number || expiry || cvv)) {
        throw new Error("Card number, expiry, or CVV is required");
      }
      return { number, expiry, cvv };
    }
    case "note": {
      const content = toNullable(row.content) ?? toNullable(row.note);
      if (!content) {
        throw new Error("Note content is required");
      }
      return { content };
    }
    default:
      throw new Error("Unsupported secret type for import");
  }
}

export function mapImportRowToSecretCreateInput(
  row: Record<string, string>,
  ctx: SecretImportContext
): SecretCreateInput {
  const name = toNullable(row.name);
  if (!name) {
    throw new Error("Secret name is required");
  }

  const kind = parseImportSecretKind(row.kind);
  if (!kind) {
    throw new Error(
      "Secret type is required (username_password, api_key, credit_card, note)"
    );
  }

  const ownerScope = parseImportOwnerScope(row.owner_scope) ?? "user";
  if (
    (ownerScope === "user" && !ctx.currentUserId) ||
    (ownerScope === "tenant" && !ctx.tenantId)
  ) {
    throw new Error("Workspace context is required to import this secret");
  }

  const ownerId = resolveOwnerId(ownerScope, row, ctx);
  const url = toNullable(row.url) ?? undefined;
  const description = toNullable(row.description) ?? undefined;

  return {
    owner_scope: ownerScope,
    owner_id: ownerId,
    name,
    kind,
    url,
    description,
    payload: buildPayload(kind, row),
  };
}

export const SECRETS_IMPORT_FIELDS: ImportFieldDefinition[] = [
  {
    key: "name",
    label: "Name",
    type: "text",
    required: true,
    description: "Secret display name",
  },
  {
    key: "kind",
    label: "Type",
    type: "text",
    required: true,
    description:
      "username_password | api_key | credit_card | note (DE: Passwort, API-Schlüssel, Kreditkarte, Notiz)",
  },
  {
    key: "owner_scope",
    label: "Owner scope",
    type: "text",
    required: false,
    description:
      "user (default) | tenant | client | project (DE: Persönlich, Workspace, Kunde, Projekt)",
  },
  {
    key: "owner_id",
    label: "Owner ID",
    type: "text",
    required: false,
    description: "UUID of client or project when owner scope is client/project",
  },
  {
    key: "owner_name",
    label: "Owner name",
    type: "text",
    required: false,
    description:
      "Client display name or project title (alternative to owner_id)",
  },
  {
    key: "client_name",
    label: "Client name",
    type: "text",
    required: false,
    description: "Alias for owner_name when importing client-owned secrets",
  },
  {
    key: "project_name",
    label: "Project name",
    type: "text",
    required: false,
    description: "Alias for owner_name when importing project-owned secrets",
  },
  {
    key: "url",
    label: "URL",
    type: "text",
    required: false,
  },
  {
    key: "description",
    label: "Description",
    type: "text",
    required: false,
  },
  {
    key: "username",
    label: "Username",
    type: "text",
    required: false,
    description: "For username_password secrets",
  },
  {
    key: "password",
    label: "Password",
    type: "text",
    required: false,
    description: "For username_password secrets",
  },
  {
    key: "value",
    label: "API key / token",
    type: "text",
    required: false,
    description: "For api_key secrets",
  },
  {
    key: "number",
    label: "Card number",
    type: "text",
    required: false,
    description: "For credit_card secrets",
  },
  {
    key: "expiry",
    label: "Card expiry",
    type: "text",
    required: false,
    description: "For credit_card secrets",
  },
  {
    key: "cvv",
    label: "CVV",
    type: "text",
    required: false,
    description: "For credit_card secrets",
  },
  {
    key: "content",
    label: "Note",
    type: "text",
    required: false,
    description: "For note secrets",
  },
];

export const SECRETS_IMPORT_PREVIEW_COLUMNS: PreviewColumn[] = [
  { key: "name", label: "Name" },
  { key: "kind", label: "Type" },
  { key: "owner_scope", label: "Scope" },
  { key: "owner_name", label: "Owner" },
  { key: "url", label: "URL" },
  { key: "username", label: "Username" },
];
