import { useTranslation } from "@engenty/i18n/ui";
import {
  cn,
  DropdownMenuItem,
  STICKY_HEADER_CLASS,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowActions,
  TableSelectionCell,
  TableSelectionHeader,
  TableSortableHeader,
} from "@engenty/ui-core";
import { Building2, ExternalLink, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { ContactListItem } from "../api.js";
import type {
  ContactsColumnVisibility,
  ContactsSortColumn,
} from "./contacts-display-dialog.js";

const COLUMN_TO_SORT: Partial<
  Record<keyof ContactsColumnVisibility, ContactsSortColumn>
> = {
  displayName: "display_name",
  legalName: "legal_name",
  contactName: "contact_name",
  email: "email",
  phone: "phone",
  location: "location",
  createdAt: "created_at",
};

type TableSize = "compact" | "normal";

interface ContactsTableProps {
  columnOrder: (keyof ContactsColumnVisibility)[];
  columnVisibility: ContactsColumnVisibility;
  entities: ContactListItem[];
  onRowClick: (entity: ContactListItem) => void;
  onSelectAll: (checked: boolean | "indeterminate") => void;
  onSelectOne: (id: string, checked: boolean) => void;
  onSortChange: (column: ContactsSortColumn) => void;
  selectedIds: Set<string>;
  sortBy: ContactsSortColumn;
  sortOrder: "asc" | "desc";
  tableSize: TableSize;
}

// ── Avatar helpers ─────────────────────────────────────────────────────────

/** Organisation avatar: blue. Person avatar: violet. */
const AVATAR_ORG =
  "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
const AVATAR_PERSON =
  "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300";

function avatarPalette(isOrg: boolean): string {
  return isOrg ? AVATAR_ORG : AVATAR_PERSON;
}

function hashIndex(str: string, length: number): number {
  let h = 5381;
  for (const ch of str) {
    h = (h * 33 + ch.charCodeAt(0)) % 2_147_483_647;
  }
  return Math.abs(h) % length;
}

// ── Role badge helpers ─────────────────────────────────────────────────────

const FIXED_ROLE_COLORS: Record<string, string> = {
  client: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  partner:
    "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  supplier:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  team: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

const ROLE_PALETTE_POOL = [
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
];

function roleBadgeClass(role: string): string {
  return (
    FIXED_ROLE_COLORS[role] ??
    ROLE_PALETTE_POOL[hashIndex(role, ROLE_PALETTE_POOL.length)]
  );
}

// ── Relative time ──────────────────────────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) {
    return "just now";
  }
  if (mins < 60) {
    return `${mins} min ago`;
  }
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) {
    return `${hrs}h ago`;
  }
  const days = Math.floor(hrs / 24);
  if (days < 30) {
    return `${days}d ago`;
  }
  return new Date(dateStr).toLocaleDateString();
}

// ── Component ──────────────────────────────────────────────────────────────

export function ContactsTable({
  entities,
  columnVisibility,
  columnOrder,
  sortBy,
  sortOrder,
  tableSize,
  selectedIds,
  onSortChange,
  onSelectAll,
  onSelectOne,
  onRowClick,
}: ContactsTableProps) {
  const { t } = useTranslation("contacts");
  const navigate = useNavigate();

  const allSelected =
    entities.length > 0 && selectedIds.size === entities.length;
  const someSelected =
    selectedIds.size > 0 && selectedIds.size < entities.length;

  const labels: Record<keyof ContactsColumnVisibility, string> = {
    displayName: t("brandName"),
    legalName: t("legalName"),
    contactName: t("contactName"),
    createdAt: t("createdAt", { defaultValue: "Created" }),
    email: t("email"),
    phone: t("phone"),
    location: t("location"),
    roles: t("roles"),
  };

  const compact = tableSize === "compact";

  return (
    <Table noWrapper>
      <TableHeader className={STICKY_HEADER_CLASS}>
        <TableRow
          className={`group hover:bg-transparent ${compact ? "[&>th]:!py-1.5" : "[&>th]:!py-3"}`}
        >
          <TableSelectionHeader
            aria-label={t("selectAll", { defaultValue: "Select all" })}
            checked={
              someSelected && !allSelected ? "indeterminate" : allSelected
            }
            compact={compact}
            onCheckedChange={onSelectAll}
          />
          {columnOrder.map((key) => {
            if (!columnVisibility[key]) {
              return null;
            }
            const sortColumn = COLUMN_TO_SORT[key];
            if (sortColumn) {
              return (
                <TableSortableHeader<ContactsSortColumn>
                  column={sortColumn}
                  compact={compact}
                  key={key}
                  onSort={onSortChange}
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                >
                  {labels[key]}
                </TableSortableHeader>
              );
            }
            return (
              <TableHead className={compact ? "!py-1.5 h-8" : ""} key={key}>
                {labels[key]}
              </TableHead>
            );
          })}
          <TableHead
            className={`w-[40px] px-1 ${compact ? "!py-1.5 h-8" : ""}`}
          />
        </TableRow>
      </TableHeader>

      {/* Row dividers removed — differentiation via hover only */}
      <TableBody className="[--ui-canvas-row-divider-w:0px]">
        {entities.map((entity) => {
          const isOrg =
            entity.type === "organisation" || entity.type !== "person";
          const primaryName =
            entity.legal_name?.trim() || entity.display_name || "-";
          const secondaryLine =
            entity.email?.trim() ||
            (!isOrg && entity.contact_name?.trim()
              ? entity.contact_name.trim()
              : null) ||
            null;
          const palette = avatarPalette(isOrg);

          return (
            <TableRow
              className={`group cursor-pointer ${compact ? "[&>td]:!py-1.5" : "[&>td]:!py-3"}`}
              data-state={selectedIds.has(entity.id) ? "selected" : undefined}
              key={entity.id}
              onClick={() => onRowClick(entity)}
            >
              <TableSelectionCell
                checked={selectedIds.has(entity.id)}
                compact={compact}
                hoverReveal
                id={entity.id}
                onCheckedChange={onSelectOne}
              />
              {columnOrder.map((key) => {
                if (!columnVisibility[key]) {
                  return null;
                }

                // ── Name + avatar cell ────────────────────────────────────
                if (key === "legalName") {
                  const Icon = isOrg ? Building2 : User;
                  const avatarSize = compact ? "h-6 w-6" : "h-7 w-7";
                  const iconSize = compact ? "size-3" : "size-3.5";
                  return (
                    <TableCell key={key}>
                      <span className="flex items-center gap-2.5">
                        <span
                          aria-hidden
                          className={cn(
                            "flex shrink-0 items-center justify-center rounded",
                            avatarSize,
                            palette
                          )}
                        >
                          <Icon className={iconSize} strokeWidth={1.75} />
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-medium text-foreground text-sm leading-snug">
                            {primaryName}
                          </span>
                          {secondaryLine && !compact && (
                            <span className="truncate text-muted-foreground text-xs leading-snug">
                              {secondaryLine}
                            </span>
                          )}
                        </span>
                      </span>
                    </TableCell>
                  );
                }

                // ── Roles cell ────────────────────────────────────────────
                if (key === "roles") {
                  const roles = entity.roles ?? [];
                  return (
                    <TableCell key={key}>
                      <span className="flex flex-wrap gap-1">
                        {(roles as string[]).map((r) => (
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 font-medium text-xs leading-none",
                              roleBadgeClass(r)
                            )}
                            key={r}
                          >
                            {t(`role.${r}`)}
                          </span>
                        ))}
                        {roles.length === 0 && (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </span>
                    </TableCell>
                  );
                }

                // ── Created-at cell ───────────────────────────────────────
                if (key === "createdAt") {
                  return (
                    <TableCell
                      className="text-muted-foreground tabular-nums"
                      key={key}
                    >
                      {entity.created_at
                        ? formatRelativeTime(entity.created_at)
                        : "—"}
                    </TableCell>
                  );
                }

                // ── Generic text cells ────────────────────────────────────
                const cellValue =
                  key === "displayName"
                    ? entity.display_name || "—"
                    : key === "contactName"
                      ? entity.contact_name || "—"
                      : key === "email"
                        ? entity.email || "—"
                        : key === "phone"
                          ? entity.phone || "—"
                          : [
                              entity.address_zip,
                              entity.address_city,
                              entity.address_country,
                            ]
                              .filter(Boolean)
                              .join(", ") || "—";

                return <TableCell key={key}>{cellValue}</TableCell>;
              })}
              <TableRowActions compact={compact}>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/mdl/contacts/${entity.id}`);
                  }}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {t("viewEntity", { defaultValue: "View" })}
                </DropdownMenuItem>
              </TableRowActions>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
