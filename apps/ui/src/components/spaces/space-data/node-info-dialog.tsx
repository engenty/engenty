/**
 * Compact Get Info sheet for a Data-tree row — location, whatever file facts
 * we have, and a short permissions summary (macOS inspector, not a settings page).
 */

import { connectionsCatalogOptions } from "@engenty/connections/ui/queries";
import { getDesktopDirectoryPath } from "@engenty/connections-local-files/ui/grant-local-folder";
import type { DriveNode } from "@engenty/file-storage";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@engenty/ui-core";
import { useMemo } from "react";
import { isConnectedFolder, isFilesTreeFile } from "./connected-folder";
import { driveNodeIcon } from "./drive-kind-icon";
import {
  type FileSpaceNodeFacts,
  fileSpaceFactsFromNode,
  useFileSpaceNodeFacts,
} from "./file-space-node-facts";

function formatBytes(bytes: number): string {
  if (bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024))
  );
  return `${(bytes / 1024 ** index).toFixed(index > 0 ? 1 : 0)} ${units[index]}`;
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function displayWhere(dataPath: string, name: string): string {
  const parts = dataPath.split("/").filter(Boolean);
  if (parts.length === 0) {
    return name;
  }
  parts[parts.length - 1] = name;
  return parts.join(" / ");
}

function originalLocation(
  facts: FileSpaceNodeFacts | null,
  connectionLabel: string | null
): string | null {
  if (!facts) {
    return null;
  }
  const relative = facts.originalRef;
  if (facts.connectionId) {
    const desktop = getDesktopDirectoryPath(facts.connectionId);
    if (desktop) {
      return relative
        ? `${desktop.replace(/[\\/]+$/, "")}/${relative}`
        : desktop;
    }
  }
  if (connectionLabel && relative) {
    return `${connectionLabel} / ${relative}`;
  }
  if (connectionLabel) {
    return connectionLabel;
  }
  return relative;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[6.25rem_minmax(0,1fr)] items-baseline gap-x-2 py-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-all text-foreground">{value}</dd>
    </div>
  );
}

export function NodeInfoDialog({
  node,
  onOpenChange,
  open,
  spaceId,
}: {
  node: DriveNode;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  spaceId: string | null;
}) {
  const { t } = useTranslation("common");
  const seed = fileSpaceFactsFromNode(node);
  const factsQuery = useFileSpaceNodeFacts(node, spaceId, open);
  const facts = factsQuery.data ?? seed;
  const catalogQuery = useQuery({
    ...connectionsCatalogOptions(),
    enabled: open && Boolean(facts.connectionId),
  });
  const isFile = isFilesTreeFile(node);
  const connectedFolder = isConnectedFolder(node);
  const Icon = driveNodeIcon({
    kind: connectedFolder ? "mount" : isFile ? "file" : node.kind,
    ...(node.moduleId ? { moduleId: node.moduleId } : {}),
    ...(node.nodeType ? { nodeType: node.nodeType } : {}),
  });

  const connection = useMemo(() => {
    const id = facts.connectionId;
    if (!id) {
      return null;
    }
    for (const connector of catalogQuery.data?.connectors ?? []) {
      const match = connector.connections.find((row) => row.id === id);
      if (match) {
        return {
          connector: connector.name,
          label: match.display_name ?? match.external_account ?? connector.name,
        };
      }
    }
    return null;
  }, [catalogQuery.data, facts.connectionId]);

  const kindLabel = connectedFolder
    ? t("spaces.data.kind.mount", { defaultValue: "Connected folder" })
    : isFile
      ? t("spaces.data.kind.file", { defaultValue: "File" })
      : t(`spaces.data.kind.${node.kind}`, {
          defaultValue: node.kind,
        });
  const where = node.dataPath
    ? displayWhere(node.dataPath, node.name)
    : node.name;
  const original = originalLocation(facts, connection?.label ?? null);
  const mime = facts.mimeType ?? node.mimeType;
  const size = facts.sizeBytes ?? node.sizeBytes;
  const updated = facts.updatedAt ?? node.updatedAt;
  const access = facts.readOnly
    ? t("spaces.data.info.readOnly", { defaultValue: "You can only read" })
    : t("spaces.data.info.readWrite", {
        defaultValue: "You can read and write",
      });

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[20rem]">
        <DialogHeader className="sr-only">
          <DialogTitle>
            {t("spaces.data.getInfo", { defaultValue: "Get Info" })}
          </DialogTitle>
          <DialogDescription>
            {t("spaces.data.info.about", {
              defaultValue: "Details for {{name}}",
              name: node.name,
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3 border-border border-b px-4 py-3">
          <Icon
            aria-hidden
            className="size-10 shrink-0 text-muted-foreground"
          />
          <div className="min-w-0">
            <p className="truncate font-medium text-sm">{node.name}</p>
            <p className="text-muted-foreground text-xs">{kindLabel}</p>
          </div>
        </div>
        <dl className="px-4 py-2.5 text-xs">
          <Fact
            label={t("spaces.data.info.kind", { defaultValue: "Kind" })}
            value={kindLabel}
          />
          {typeof size === "number" ? (
            <Fact
              label={t("spaces.data.info.size", { defaultValue: "Size" })}
              value={formatBytes(size)}
            />
          ) : null}
          {mime ? (
            <Fact
              label={t("spaces.data.info.type", { defaultValue: "Type" })}
              value={mime}
            />
          ) : null}
          <Fact
            label={t("spaces.data.info.where", { defaultValue: "Where" })}
            value={where}
          />
          {original && original !== where ? (
            <Fact
              label={t("spaces.data.info.original", {
                defaultValue: "Original",
              })}
              value={original}
            />
          ) : null}
          {connection ? (
            <Fact
              label={t("spaces.data.info.connection", {
                defaultValue: "Connection",
              })}
              value={
                connection.connector === connection.label
                  ? connection.label
                  : `${connection.label} · ${connection.connector}`
              }
            />
          ) : null}
          {facts.createdAt ? (
            <Fact
              label={t("spaces.data.info.created", { defaultValue: "Created" })}
              value={formatWhen(facts.createdAt)}
            />
          ) : null}
          {updated ? (
            <Fact
              label={t("spaces.data.info.modified", {
                defaultValue: "Modified",
              })}
              value={formatWhen(updated)}
            />
          ) : null}
        </dl>
        <div className="border-border border-t px-4 py-2.5 text-xs">
          <p className="mb-1 font-medium">
            {t("spaces.data.permissions", { defaultValue: "Permissions" })}
          </p>
          <p className="text-muted-foreground">{access}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
