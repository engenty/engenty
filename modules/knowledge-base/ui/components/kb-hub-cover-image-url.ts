import { useEffect, useState } from "react";
import type { KbCover } from "../../src/schema/types.js";
import { getFileStorageSignedUrl } from "../file-storage-url.js";

export function isHttpImageUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

export function useResolvedKbCoverImageUrl(
  cover: KbCover | null | undefined
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
    void getFileStorageSignedUrl(raw).then(
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
