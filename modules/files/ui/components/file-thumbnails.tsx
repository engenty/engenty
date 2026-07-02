import { Skeleton } from "@engenty/ui-core";
import { FileImage, FileText } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getFilesThumbnailUrl, getFilesUrl } from "../api.js";

/** Inline preview for raster image files (resolves a signed URL lazily). */
export function CardThumbnail({
  fileKey,
  filename,
  className,
}: {
  className?: string;
  fileKey: string;
  filename: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const loadUrl = useCallback(async () => {
    try {
      const result = await getFilesUrl(fileKey);
      setUrl(result.url);
    } catch {
      setError(true);
    }
  }, [fileKey]);

  useEffect(() => {
    void loadUrl();
  }, [loadUrl]);

  if (error) {
    return <FileImage className="h-8 w-8 text-muted-foreground" />;
  }
  if (!url) {
    return <Skeleton className="h-full w-full" />;
  }
  return (
    <img
      alt={filename}
      className={className ?? "h-full w-full object-cover"}
      height={80}
      loading="lazy"
      onError={() => setError(true)}
      src={url}
      width={120}
    />
  );
}

/** Raster thumbnail from first PDF page (PDF + office types); stored as `.thumb.webp`. */
export function CardDocThumbnail({
  bucket,
  className,
  fileKey,
}: {
  bucket?: string;
  className?: string;
  fileKey: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const loadUrl = useCallback(async () => {
    try {
      const result = await getFilesThumbnailUrl(fileKey, bucket);
      setUrl(result.url);
    } catch {
      setError(true);
    }
  }, [bucket, fileKey]);

  useEffect(() => {
    void loadUrl();
  }, [loadUrl]);

  if (error) {
    return <FileText className="h-8 w-8 text-muted-foreground" />;
  }
  if (!url) {
    return <Skeleton className="h-full w-full" />;
  }
  return (
    <img
      alt=""
      className={className ?? "h-full w-full object-cover object-top"}
      height={80}
      loading="lazy"
      onError={() => setError(true)}
      src={url}
      width={120}
    />
  );
}
