import { fileStorageTenantObjectKey } from "@engenty/file-storage";
import type { PluginServerApi } from "@engenty/plugin-sdk";
import { z } from "@hono/zod-openapi";
import {
  companyProfileSettingsInputSchema,
  companyProfileSettingsSchema,
} from "../schema/zod.js";
import { getRepo, type RepoOrFactory } from "./repo.js";

type FileStorageService = NonNullable<
  ReturnType<NonNullable<PluginServerApi["getStorageService"]>>
>;

const LOGO_CONTENT_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

const ALLOWED_MIME_TYPES = new Set(Object.keys(LOGO_CONTENT_TYPES));

/** Decode a base64 data URL into a Blob and its MIME type. */
function dataUrlToBlob(dataUrl: string): { blob: Blob; contentType: string } {
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx === -1) {
    throw new Error("Malformed data URL: missing comma.");
  }
  const header = dataUrl.slice(0, commaIdx);
  const mimeMatch = header.match(/^data:([^;]+)/);
  if (!mimeMatch) {
    throw new Error("Malformed data URL: could not parse MIME type.");
  }
  const contentType = mimeMatch[1].toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(contentType)) {
    throw new Error(
      `Unsupported image type "${contentType}". Allowed: PNG, JPEG, GIF, WebP.`
    );
  }
  const base64 = dataUrl.slice(commaIdx + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return { blob: new Blob([bytes], { type: contentType }), contentType };
}

/** Upload a decoded image blob to tenant storage and return the public URL. */
async function uploadLogoBlob(
  storage: FileStorageService,
  tenantId: string,
  blob: Blob,
  contentType: string
): Promise<string> {
  const ext = LOGO_CONTENT_TYPES[contentType] ?? "bin";
  const key = fileStorageTenantObjectKey(
    tenantId,
    "company-profile",
    "logos",
    `${Date.now()}_logo.${ext}`
  );
  await storage.upload(key, blob, { contentType, upsert: true });
  return storage.getUrl(key);
}

/**
 * Reject non-public destinations before the server fetches a remote logo, so the
 * tool can't be used to probe localhost, link-local, or private-network hosts
 * (SSRF). Mirrors the guard the website-research tool applies to its fetches.
 */
function isPublicHttpUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return false;
  }
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1"
  ) {
    return false;
  }
  if (/^10\./.test(host) || /^192\.168\./.test(host)) {
    return false;
  }
  const private172 = host.match(/^172\.(\d{1,3})\./);
  if (private172) {
    const octet = Number.parseInt(private172[1] ?? "", 10);
    if (octet >= 16 && octet <= 31) {
      return false;
    }
  }
  return true;
}

/**
 * Fetch a public image URL and persist it in the tenant's file storage, mirroring
 * the logo-upload HTTP route so AI-set logos are owned assets rather than
 * hotlinks. Falls back to the source URL when no storage service is available.
 */
async function rehostLogoFromUrl(
  storage: FileStorageService | null | undefined,
  tenantId: string,
  imageUrl: string
): Promise<string> {
  if (!isPublicHttpUrl(imageUrl)) {
    throw new Error(
      "Invalid logo URL. Provide a public https image URL (not localhost or a private address)."
    );
  }

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch logo image (HTTP ${response.status}).`);
  }

  const contentType =
    response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ??
    "";
  if (!ALLOWED_MIME_TYPES.has(contentType)) {
    throw new Error(
      `Unsupported image type "${contentType || "unknown"}". Allowed: PNG, JPEG, GIF, WebP.`
    );
  }

  if (!storage) {
    return imageUrl;
  }

  const blob = await response.blob();
  return uploadLogoBlob(storage, tenantId, blob, contentType);
}

/**
 * Decode a data URL and persist the image in tenant storage.
 * Falls back to returning the raw data URL when no storage is available.
 */
async function rehostLogoFromDataUrl(
  storage: FileStorageService | null | undefined,
  tenantId: string,
  dataUrl: string
): Promise<string> {
  const { blob, contentType } = dataUrlToBlob(dataUrl);
  if (!storage) {
    return dataUrl;
  }
  return uploadLogoBlob(storage, tenantId, blob, contentType);
}

export function registerCompanyProfileGatewayMethods(
  server: Pick<PluginServerApi, "registerOperation">,
  repoOrFactory: RepoOrFactory,
  storage?: FileStorageService | null
) {
  server.registerOperation({
    operationId: "company_profile_get",
    summary: "Get default company profile",
    moduleId: "company-profile",
    spacePolicy: { kind: "tenant_shared" },
    requiredCapabilities: ["module.company-profile.read"],
    riskLevel: "low",
    idempotent: true,
    dryRunSupported: false,
    requiresApproval: false,
    inputSchema: z.object({}).optional(),
    outputSchema: companyProfileSettingsSchema,
    handler: async (_input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      return repo.get();
    },
  });

  server.registerOperation({
    operationId: "company_profile_set",
    summary: "Create or update company profile settings (partial merge)",
    moduleId: "company-profile",
    spacePolicy: { kind: "tenant_shared" },
    requiredCapabilities: ["module.company-profile.write"],
    riskLevel: "low",
    idempotent: false,
    dryRunSupported: false,
    requiresApproval: false,
    inputSchema: companyProfileSettingsInputSchema,
    outputSchema: companyProfileSettingsSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      return repo.merge(input ?? {});
    },
  });

  server.registerOperation({
    operationId: "company_profile_set_logo",
    summary:
      "Set or clear the company logo from a public image URL or data URL",
    moduleId: "company-profile",
    spacePolicy: { kind: "tenant_shared" },
    requiredCapabilities: ["module.company-profile.write"],
    riskLevel: "low",
    idempotent: false,
    dryRunSupported: false,
    requiresApproval: false,
    inputSchema: z.object({
      image_url: z
        .union([
          z.string().url(),
          z.string().regex(/^data:image\/(png|jpeg|gif|webp);base64,/i),
        ])
        .nullable()
        .describe(
          "Public image URL or base64 data URL (PNG, JPEG, GIF, WebP), or null to remove the logo."
        ),
    }),
    outputSchema: companyProfileSettingsSchema,
    handler: async (input, ctx) => {
      const { image_url } = input as { image_url: string | null };
      const repo = getRepo(repoOrFactory, ctx.auth);
      if (image_url == null) {
        return repo.merge({ logo_url: null });
      }
      const tenantId = ctx.auth?.tenantId ?? "unknown";
      const logoUrl = image_url.startsWith("data:")
        ? await rehostLogoFromDataUrl(storage, tenantId, image_url)
        : await rehostLogoFromUrl(storage, tenantId, image_url);
      return repo.merge({ logo_url: logoUrl });
    },
  });

  server.registerOperation({
    operationId: "company_profile_upload_asset",
    summary:
      "Upload a base64 data URL image to tenant storage and return a public URL",
    moduleId: "company-profile",
    spacePolicy: { kind: "tenant_shared" },
    requiredCapabilities: ["module.company-profile.write"],
    riskLevel: "low",
    idempotent: false,
    dryRunSupported: false,
    requiresApproval: false,
    inputSchema: z.object({
      data_url: z
        .string()
        .regex(/^data:image\/(png|jpeg|gif|webp);base64,/i)
        .describe("Base64-encoded image data URL (PNG, JPEG, GIF, or WebP)."),
    }),
    outputSchema: z.object({
      ok: z.literal(true),
      url: z.string().describe("Public URL of the uploaded asset."),
      content_type: z.string(),
    }),
    handler: async (input, ctx) => {
      const { data_url } = input as { data_url: string };
      const tenantId = ctx.auth?.tenantId ?? "unknown";
      const { blob, contentType } = dataUrlToBlob(data_url);
      if (!storage) {
        throw new Error("Storage service not available.");
      }
      const url = await uploadLogoBlob(storage, tenantId, blob, contentType);
      return { ok: true as const, url, content_type: contentType };
    },
  });
}
