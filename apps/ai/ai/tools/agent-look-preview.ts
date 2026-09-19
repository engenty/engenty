import { fileStorageTenantObjectKey } from "@engenty/file-storage";

const PREVIEW_TTL_MS = 30 * 60 * 1000;

export interface AgentLookPreview {
  agentId: string;
  bytes: Uint8Array;
  contentType: "image/png";
  createdAt: number;
  format: "png" | "svg";
  svg?: string;
  tenantId: string;
}

const previews = new Map<string, AgentLookPreview>();

function prune(now: number) {
  for (const [id, preview] of previews) {
    if (now - preview.createdAt > PREVIEW_TTL_MS) {
      previews.delete(id);
    }
  }
}

export function putAgentLookPreview(preview: AgentLookPreview): string {
  prune(Date.now());
  const id = crypto.randomUUID();
  previews.set(id, preview);
  return id;
}

export function getAgentLookPreview(input: {
  agentId: string;
  previewId: string;
  tenantId: string;
}): AgentLookPreview | null {
  const preview = previews.get(input.previewId);
  if (!preview) {
    return null;
  }
  if (
    preview.agentId !== input.agentId ||
    preview.tenantId !== input.tenantId
  ) {
    return null;
  }
  if (Date.now() - preview.createdAt > PREVIEW_TTL_MS) {
    previews.delete(input.previewId);
    return null;
  }
  return preview;
}

export function clearAgentLookPreviewsForTests() {
  previews.clear();
}

export function agentLookAvatarObjectKey(
  tenantId: string,
  agentId: string
): string {
  const safeId = agentId.replace(/[^a-z0-9.-]/gi, "_");
  return fileStorageTenantObjectKey(
    tenantId,
    "ai",
    "agents",
    safeId,
    "avatar.png"
  );
}

export function bytesToPngDataUrl(bytes: Uint8Array): string {
  return `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
}
