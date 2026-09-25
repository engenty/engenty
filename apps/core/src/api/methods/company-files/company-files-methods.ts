// `company_files_publish` / `company_files_remove` — the only way an agent
// changes the company drive (`/company/files`).
//
// Every run sees the drive read-only: it is the one folder all Spaces share,
// so a write into it is a publication to the whole company. A person holding
// `core.company_files.manage` publishes directly; an agent's call always parks
// on an approval that only such a person can decide (`approverCapability`,
// enforced by policy and by the decision route). The audit row names both.

import {
  companyFilesPrefix,
  createFileStorageService,
  createSupabaseFileStorageProvider,
  type FileStorageService,
  guessFileStorageMimeFromFilename,
} from "@engenty/file-storage";
import {
  COMPANY_FILES_MANAGE_CAPABILITY,
  capabilityCovers,
  type PluginAuthContext,
  type PluginGatewayMethod,
  PluginOperationError,
} from "@engenty/plugin-sdk";
import { z } from "zod";

import { createDatabaseAdapter } from "../../../infra/index.js";

const COMPANY_FILES_BUCKET = "files";
const MAX_PUBLISH_BYTES = 10 * 1024 * 1024;
const MOUNT_PREFIX = "/company/files/";

// Files that are credentials by name. Publishing one would hand every Space
// the key; there is no reading of the drive that makes that right.
const SECRET_FILE_NAMES = [
  /^\.env(\..*)?$/i,
  /\.(pem|key|p12|pfx|jks|keystore)$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)$/i,
  /^\.npmrc$/i,
  /^\.netrc$/i,
  /^credentials(\.json)?$/i,
];
const PRIVATE_KEY_BLOCK = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;
const LEADING_SLASHES = /^\/+/;

const publishInputSchema = z.object({
  content: z.string(),
  encoding: z.enum(["utf8", "base64"]).default("utf8"),
  path: z.string().min(1).max(512),
});

const removeInputSchema = z.object({
  path: z.string().min(1).max(512),
});

/** `/company/files/brand/logo.svg` or `brand/logo.svg` → `brand/logo.svg`. */
export function companyFilePath(raw: string): string {
  const trimmed = raw.trim();
  const relative = (
    trimmed.startsWith(MOUNT_PREFIX)
      ? trimmed.slice(MOUNT_PREFIX.length)
      : trimmed
  ).replace(LEADING_SLASHES, "");
  const segments = relative.split("/");
  if (
    !relative ||
    relative.endsWith("/") ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new PluginOperationError(
      "company_file_path_invalid",
      `Not a file path inside /company/files: ${raw}`,
      { status: 400 }
    );
  }
  return relative;
}

function refuseSecret(relative: string, bytes: Uint8Array): void {
  const name = relative.split("/").pop() ?? relative;
  const looksLikeKey =
    SECRET_FILE_NAMES.some((pattern) => pattern.test(name)) ||
    PRIVATE_KEY_BLOCK.test(new TextDecoder().decode(bytes.slice(0, 64 * 1024)));
  if (looksLikeKey) {
    throw new PluginOperationError(
      "company_file_secret_refused",
      `${relative} looks like a credential; the company drive never holds one.`,
      { status: 422 }
    );
  }
}

/**
 * A person or service must hold the capability themselves. An agent got here
 * only through an approval its holder decided — policy never lets an agent
 * call through without one.
 */
function assertMayWrite(auth: PluginAuthContext | undefined): string {
  if (!auth?.tenantId) {
    throw new PluginOperationError(
      "tenant_required",
      "Tenant context required",
      { status: 400 }
    );
  }
  if (
    auth.principalType !== "agent" &&
    !capabilityCovers(auth.capabilities ?? [], COMPANY_FILES_MANAGE_CAPABILITY)
  ) {
    throw new PluginOperationError(
      "company_files_forbidden",
      `Writing the company drive needs ${COMPANY_FILES_MANAGE_CAPABILITY}.`,
      { status: 403 }
    );
  }
  return auth.tenantId;
}

function storageFor(config: Record<string, unknown>): () => FileStorageService {
  let service: FileStorageService | undefined;
  return () => {
    if (!service) {
      const client = createDatabaseAdapter(config);
      if (!client) {
        throw new Error("company files require Supabase configuration.");
      }
      service = createFileStorageService({
        provider: createSupabaseFileStorageProvider({
          bucket: COMPANY_FILES_BUCKET,
          client,
        }),
      });
    }
    return service;
  };
}

const OPERATION = {
  approverCapability: COMPANY_FILES_MANAGE_CAPABILITY,
  audit: "always",
  moduleId: "core",
  requiresApproval: true,
  riskLevel: "high",
  spacePolicy: { kind: "tenant_shared" },
} as const;

export function buildCompanyFilesPublishMethod(
  config: Record<string, unknown>
): PluginGatewayMethod {
  const storage = storageFor(config);
  return {
    description:
      "Publish a file to the company drive (/company/files), readable by every Space. Needs approval by someone holding core.company_files.manage. Credentials are refused.",
    handler: async (input, ctx) => {
      const tenantId = assertMayWrite(ctx.auth);
      const body = publishInputSchema.parse(input);
      const relative = companyFilePath(body.path);
      const bytes =
        body.encoding === "base64"
          ? new Uint8Array(Buffer.from(body.content, "base64"))
          : new TextEncoder().encode(body.content);
      if (bytes.byteLength > MAX_PUBLISH_BYTES) {
        throw new PluginOperationError(
          "company_file_too_large",
          `A published file is at most ${MAX_PUBLISH_BYTES} bytes.`,
          { status: 413 }
        );
      }
      refuseSecret(relative, bytes);
      const key = `${companyFilesPrefix(tenantId)}${relative}`;
      await storage().upload(key, bytes, {
        contentType: guessFileStorageMimeFromFilename(relative),
        upsert: true,
      });
      return {
        path: `${MOUNT_PREFIX}${relative}`,
        size_bytes: bytes.byteLength,
      };
    },
    inputSchema: publishInputSchema,
    name: "company_files_publish",
    operation: { ...OPERATION, operationId: "company_files_publish" },
    summary: "Publish a file to the company drive",
  };
}

export function buildCompanyFilesRemoveMethod(
  config: Record<string, unknown>
): PluginGatewayMethod {
  const storage = storageFor(config);
  return {
    description:
      "Remove a file from the company drive (/company/files). Needs approval by someone holding core.company_files.manage.",
    handler: async (input, ctx) => {
      const tenantId = assertMayWrite(ctx.auth);
      const relative = companyFilePath(removeInputSchema.parse(input).path);
      await storage().delete(`${companyFilesPrefix(tenantId)}${relative}`);
      return { path: `${MOUNT_PREFIX}${relative}`, removed: true };
    },
    inputSchema: removeInputSchema,
    name: "company_files_remove",
    operation: { ...OPERATION, operationId: "company_files_remove" },
    summary: "Remove a file from the company drive",
  };
}
