import { requestApiJson } from "@engenty/api-client";
import { useEffect, useState } from "react";
import { type Cover, isHttpImageUrl } from "../cover.js";

async function signedFileUrl(storageKey: string): Promise<string> {
  const params = new URLSearchParams({ key: storageKey });
  const { url } = await requestApiJson<{ url: string }>(
    `/api/file-storage/files/url?${params.toString()}`,
    { method: "GET" }
  );
  return url;
}

/** The image a cover shows: its URL as is, or a signed URL for a storage key. */
export function useResolvedCoverImageUrl(
  cover: Cover | null | undefined
): string | undefined {
  const raw =
    cover?.type === "image" && cover.value.trim().length > 0
      ? cover.value.trim()
      : undefined;
  const [url, setUrl] = useState<string | undefined>(() =>
    raw && isHttpImageUrl(raw) ? raw : undefined
  );

  useEffect(() => {
    if (!raw) {
      setUrl(undefined);
      return;
    }
    if (isHttpImageUrl(raw)) {
      setUrl(raw);
      return;
    }
    let cancelled = false;
    void signedFileUrl(raw).then(
      (signed) => {
        if (!cancelled) {
          setUrl(signed);
        }
      },
      () => {
        if (!cancelled) {
          setUrl(undefined);
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [raw]);

  return url;
}

/** Inline paint for a cover band's background layer. */
export function coverPaintStyle(
  cover: Cover | null | undefined,
  resolvedImageUrl: string | undefined
): React.CSSProperties {
  if (cover?.type === "image") {
    return resolvedImageUrl
      ? {
          backgroundImage: `url(${resolvedImageUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }
      : {};
  }
  if (cover?.type === "color") {
    return { backgroundColor: cover.value };
  }
  if (cover?.type === "gradient") {
    return { background: cover.value };
  }
  return {};
}
