import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@engenty/ui-core";
import { Link } from "react-router-dom";
import type { KbSource } from "../../src/schema/types.js";
import { kbSourceItemPath } from "../kb-paths.js";
import { kbSourceItemsQueryOptions, useKbSourceMutations } from "../queries.js";

interface SourceItemsDialogProps {
  kbSlug: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  source: KbSource | null;
}

export function SourceItemsDialog({
  kbSlug,
  onOpenChange,
  open,
  source,
}: SourceItemsDialogProps) {
  const { t } = useTranslation("kb");
  const { data, isLoading } = useQuery(
    kbSourceItemsQueryOptions({
      page: 1,
      page_size: 200,
      sourceId: source?.id ?? "",
    })
  );
  const mutations = useKbSourceMutations();
  const rows = data?.data ?? [];

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t("sources.retrieved_items")}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-muted-foreground text-sm">
            {t("sources.no_retrieved_items")}
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-auto rounded-md border">
            <Table noWrapper>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("sources.name")}</TableHead>
                  <TableHead>{t("sources.status")}</TableHead>
                  <TableHead>{t("sources.last_seen")}</TableHead>
                  <TableHead className="text-right">
                    {t("sources.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="max-w-md truncate">
                        <Link
                          className="text-primary hover:underline"
                          onClick={() => onOpenChange(false)}
                          to={kbSourceItemPath(kbSlug, item.id)}
                        >
                          {item.title ||
                            item.source_url ||
                            item.adapter_item_key}
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell className="capitalize">
                      {item.status.replaceAll("_", " ")}
                    </TableCell>
                    <TableCell>
                      {item.last_seen_at
                        ? new Date(item.last_seen_at).toLocaleString()
                        : t("sources.never")}
                    </TableCell>
                    <TableCell className="text-right">
                      {source ? (
                        <Button
                          onClick={() =>
                            mutations.updateItemStatus.mutate({
                              itemId: item.id,
                              sourceId: source.id,
                              status:
                                item.status === "ignored"
                                  ? "active"
                                  : "ignored",
                            })
                          }
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {item.status === "ignored"
                            ? t("sources.activate")
                            : t("sources.ignore")}
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
