/**
 * A URL a browser can put in `<iframe src>` / `<img src>`.
 *
 * Native files already return a signed storage URL. Connector and local-files
 * downloads are `/api/.../download` and need a session — fetch them, then hand
 * the pane a blob URL so Chrome's PDF viewer never sees the 401 JSON body.
 */
import { useQuery } from "@engenty/query-client";
import { useEffect, useMemo } from "react";
import {
  fetchFileSpaceBytes,
  isFileSpaceProxyUrl,
} from "@/lib/api/space-drive-client";

export function useFileSpacePreviewSrc(
  url: string | undefined,
  mime: string,
  enabled: boolean
) {
  const proxy = Boolean(url && isFileSpaceProxyUrl(url));
  const query = useQuery({
    enabled: Boolean(url) && enabled && proxy,
    // Blobs break TanStack structural sharing; the cache keeps an ArrayBuffer.
    structuralSharing: false,
    queryFn: async ({ signal }) => {
      const blob = await fetchFileSpaceBytes(url as string, signal);
      return blob.arrayBuffer();
    },
    queryKey: ["space-drive", "file-bytes", url],
    refetchOnMount: "always",
    staleTime: 60_000,
  });
  const objectUrl = useMemo(() => {
    if (!query.data) {
      return;
    }
    const blob = new Blob([query.data], {
      type: mime || "application/octet-stream",
    });
    return URL.createObjectURL(blob);
  }, [mime, query.data]);
  useEffect(
    () => () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    },
    [objectUrl]
  );
  return {
    bytesError: Boolean(query.error) && !query.data,
    bytesPending: proxy && enabled && !query.data && query.isPending,
    src: proxy ? objectUrl : url,
  };
}
