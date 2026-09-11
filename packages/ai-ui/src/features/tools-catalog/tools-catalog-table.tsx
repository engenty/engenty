// Grouped table view for the tools catalog: Tool / Source / Description / Exposure.

import { useTranslation } from "@engenty/i18n/ui";
import {
  AdminListGroupHeader,
  AdminListGroupPill,
  cn,
  DropdownMenuItem,
  DropdownMenuSeparator,
  STICKY_HEADER_CLASS,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowActions,
} from "@engenty/ui-core";
import { Pencil, Trash2, Wrench } from "lucide-react";
import { Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { buildToolEditPath } from "../agents-workspace/agent-workspace-paths";
import { ToolSourceBadgeForTool } from "./tool-source-badge";
import {
  deriveToolSource,
  deriveToolSourceCategory,
  type RegistryToolEntry,
  type ToolsGroup,
} from "./tools-catalog-state";

const rowBodyBaseClass = cn(
  "[--ui-canvas-row-divider-w:0px]",
  "[&>tr:hover>td]:bg-muted/50 [&>tr>td]:bg-card",
  "[&>tr>td:first-child]:pl-4"
);

/** Per-group card chrome — only when grouped (a flat list gets no card). */
const groupCardChromeClass = cn(
  "ui-card-raised",
  "[&>tr:first-child>td:first-child]:rounded-tl-md",
  "[&>tr:first-child>td:last-child]:rounded-tr-md",
  "[&>tr:last-child>td:first-child]:rounded-bl-md",
  "[&>tr:last-child>td:last-child]:rounded-br-md"
);

interface ToolsCatalogTableProps {
  grouped: boolean;
  groups: ToolsGroup[];
  isGroupOpen: (id: string) => boolean;
  onDelete: (tool: RegistryToolEntry) => void;
  onToggleGroup: (id: string) => void;
}

export function ToolsCatalogTable({
  grouped,
  groups,
  isGroupOpen,
  onDelete,
  onToggleGroup,
}: ToolsCatalogTableProps) {
  const { t } = useTranslation("ai-ui");
  const navigate = useNavigate();

  const groupCountLabel = (count: number) =>
    `${count} ${count === 1 ? t("toolsCatalog.groupCountSingular") : t("toolsCatalog.groupCountPlural")}`;

  return (
    <Table className="mb-2" noWrapper>
      <TableHeader className={STICKY_HEADER_CLASS}>
        <TableRow className="group hover:bg-transparent [&>th:first-child]:pl-4">
          <TableHead>{t("toolsCatalog.columnTool")}</TableHead>
          <TableHead>{t("toolsCatalog.columnSource")}</TableHead>
          <TableHead>{t("toolsCatalog.columnDescription")}</TableHead>
          <TableHead>{t("toolsCatalog.columnExposure")}</TableHead>
          <TableHead className="w-[40px] px-1" />
        </TableRow>
      </TableHeader>
      {groups.map((group) => {
        const open = grouped ? isGroupOpen(group.id) : true;
        return (
          <Fragment key={group.id}>
            {grouped ? (
              <TableBody>
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    className="border-0 bg-transparent px-0 pt-4 pb-1"
                    colSpan={5}
                  >
                    <AdminListGroupHeader
                      count={groupCountLabel(group.tools.length)}
                      onToggle={() => onToggleGroup(group.id)}
                      open={open}
                      toggleLabel={t("toolsCatalog.toggleGroup")}
                    >
                      <AdminListGroupPill>{group.label}</AdminListGroupPill>
                    </AdminListGroupHeader>
                  </TableCell>
                </TableRow>
              </TableBody>
            ) : null}
            {open ? (
              <TableBody
                className={cn(
                  rowBodyBaseClass,
                  grouped && groupCardChromeClass
                )}
              >
                {group.tools.map((tool) => {
                  const src = deriveToolSource(tool);
                  const category = deriveToolSourceCategory(tool);
                  const isCustom = category === "custom";
                  return (
                    <TableRow
                      className={isCustom ? "cursor-pointer" : undefined}
                      key={tool.id}
                      onClick={
                        isCustom
                          ? () => navigate(buildToolEditPath(tool.id))
                          : undefined
                      }
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Wrench
                            aria-hidden
                            className="size-4 shrink-0 text-muted-foreground opacity-80"
                          />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-sm">
                              {tool.name}
                            </p>
                            <p className="truncate font-mono text-muted-foreground text-xs">
                              {tool.id}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <ToolSourceBadgeForTool
                          category={category}
                          derivedSource={src}
                        />
                      </TableCell>
                      <TableCell className="max-w-xs text-muted-foreground text-sm">
                        <p className="truncate">{tool.description ?? "—"}</p>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {"—"}
                      </TableCell>
                      {isCustom ? (
                        <TableRowActions>
                          <DropdownMenuItem
                            onSelect={() =>
                              navigate(buildToolEditPath(tool.id))
                            }
                          >
                            <Pencil aria-hidden className="mr-2 size-4" />
                            {t("toolsCatalog.actions.edit")}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => onDelete(tool)}
                          >
                            <Trash2 aria-hidden className="mr-2 size-4" />
                            {t("toolsCatalog.actions.delete")}
                          </DropdownMenuItem>
                        </TableRowActions>
                      ) : (
                        <TableCell />
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            ) : null}
          </Fragment>
        );
      })}
    </Table>
  );
}
