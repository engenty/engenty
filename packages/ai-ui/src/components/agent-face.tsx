"use client";

import type { AgentEngentyKind } from "@engenty/ai-core/browser";
import { useQuery } from "@engenty/query-client";
import { cn, Engenty } from "@engenty/ui-core";
import { getFileStorageSignedUrl } from "../lib/file-storage-signed-url.js";

function isDirectImageSrc(value: string): boolean {
  return (
    value.startsWith("data:image/") ||
    value.startsWith("https://") ||
    value.startsWith("http://")
  );
}

function BlobFace({
  animated = false,
  className,
  kind,
  size,
}: {
  animated?: boolean;
  className?: string;
  kind: AgentEngentyKind;
  size: number;
}) {
  return (
    <Engenty
      animated={animated}
      className={className}
      kind={kind}
      size={size}
    />
  );
}

function Portrait({
  alt,
  className,
  size,
  src,
}: {
  alt: string;
  className?: string;
  size: number;
  src: string;
}) {
  return (
    <img
      alt={alt}
      className={cn("shrink-0 rounded-full object-cover", className)}
      height={size}
      src={src}
      style={{ height: size, width: size }}
      width={size}
    />
  );
}

function SignedPortrait({
  animated,
  className,
  kind,
  name,
  size,
  storageKey,
}: {
  animated: boolean;
  className?: string;
  kind: AgentEngentyKind;
  name?: string;
  size: number;
  storageKey: string;
}) {
  const signed = useQuery({
    queryFn: () => getFileStorageSignedUrl(storageKey),
    queryKey: ["agent-avatar-url", storageKey],
    staleTime: 45 * 60 * 1000,
  });
  if (!signed.data) {
    return (
      <BlobFace
        animated={animated}
        className={className}
        kind={kind}
        size={size}
      />
    );
  }
  return (
    <Portrait
      alt={name ?? ""}
      className={className}
      size={size}
      src={signed.data}
    />
  );
}

export function AgentFace({
  animated = false,
  avatarUrl,
  className,
  kind,
  name,
  size,
}: {
  animated?: boolean;
  avatarUrl?: string | null;
  className?: string;
  kind: AgentEngentyKind;
  name?: string;
  size: number;
}) {
  const key = avatarUrl?.trim() || null;
  if (!key) {
    return (
      <BlobFace
        animated={animated}
        className={className}
        kind={kind}
        size={size}
      />
    );
  }
  if (isDirectImageSrc(key)) {
    return (
      <Portrait alt={name ?? ""} className={className} size={size} src={key} />
    );
  }
  return (
    <SignedPortrait
      animated={animated}
      className={className}
      kind={kind}
      name={name}
      size={size}
      storageKey={key}
    />
  );
}
