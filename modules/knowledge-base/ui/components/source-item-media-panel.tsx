import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@engenty/ui-core";
import type { KbSourceItemMedia } from "../../src/schema/types.js";

function formatBytes(bytes: number | null): string {
  if (!bytes) {
    return "—";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 102.4) / 10} KB`;
  }
  return `${Math.round(bytes / 1024 / 102.4) / 10} MB`;
}

export function SourceItemMediaPanel({
  media,
}: {
  media: KbSourceItemMedia[];
}) {
  const { t } = useTranslation("kb");

  if (media.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {t("sources.source_item_no_media")}
      </p>
    );
  }

  return (
    <div className="overflow-auto">
      <Table noWrapper>
        <TableHeader>
          <TableRow>
            <TableHead>{t("sources.media_preview")}</TableHead>
            <TableHead>{t("sources.media_title")}</TableHead>
            <TableHead>{t("sources.media_type")}</TableHead>
            <TableHead>{t("sources.media_storage")}</TableHead>
            <TableHead>{t("sources.media_size")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {media.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="w-20">
                {item.media_type === "image" ? (
                  <img
                    alt={item.alt_text ?? item.title ?? ""}
                    className="h-12 w-16 rounded border object-cover"
                    height={48}
                    src={item.source_url}
                    width={64}
                  />
                ) : (
                  <span className="text-muted-foreground text-xs">
                    {item.media_type}
                  </span>
                )}
              </TableCell>
              <TableCell className="min-w-56">
                <div className="flex max-w-md flex-col gap-1">
                  <span className="truncate text-sm">
                    {item.title || item.alt_text || item.description || "—"}
                  </span>
                  <a
                    className="truncate text-primary text-xs hover:underline"
                    href={item.source_url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {item.source_url}
                  </a>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-1 text-xs">
                  <span>{item.content_type ?? item.media_type}</span>
                  {item.width || item.height ? (
                    <span className="text-muted-foreground">
                      {item.width ?? "?"} × {item.height ?? "?"}
                    </span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex max-w-xs flex-col gap-1">
                  <Badge variant="outline">{item.download_status}</Badge>
                  {item.storage_object_key ? (
                    <span className="truncate font-mono text-muted-foreground text-xs">
                      {item.storage_object_key}
                    </span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell>{formatBytes(item.size_bytes)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
