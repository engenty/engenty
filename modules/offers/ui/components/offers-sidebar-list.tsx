import { shellSecondaryNavItemProps } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SidebarNavList,
  SidebarNavSectionLabel,
  SidebarRow,
  SidebarRowActions,
  SidebarRowButton,
  Skeleton,
  sidebarColumnContentInsetClassName,
} from "@engenty/ui-core";
import { ExternalLink, MoreHorizontal, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { OfferListItem } from "../api.js";
import type { OffersListGroup } from "../lib/offer-list-grouping.js";
import { OfferStatusBadge } from "./offer-status-badge.js";

/** Draft offers open in the draft editor; everything else on the detail page. */
export function offerSidebarPath(offer: OfferListItem): string {
  return offer.status === "draft"
    ? `/mdl/offers/${offer.id}/draft`
    : `/mdl/offers/${offer.id}`;
}

export function OffersSidebarEntitySkeleton() {
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5",
        sidebarColumnContentInsetClassName
      )}
    >
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton className="h-6 w-full" key={`offer-${i}`} />
      ))}
    </div>
  );
}

interface OfferSidebarRowProps {
  active: boolean;
  offer: OfferListItem;
  onDelete: (id: string) => void;
}

export function OfferSidebarRow({
  active,
  offer,
  onDelete,
}: OfferSidebarRowProps) {
  const { t } = useTranslation("offers");
  const navigate = useNavigate();

  return (
    <SidebarRow isActive={active}>
      <SidebarRowButton asChild isActive={active}>
        <Link to={offerSidebarPath(offer)} {...shellSecondaryNavItemProps}>
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="min-w-0 flex-1 truncate">{offer.title}</span>
            <OfferStatusBadge
              className="shrink-0 px-1.5 py-0 text-xxs"
              status={offer.status}
            />
          </span>
        </Link>
      </SidebarRowButton>
      <SidebarRowActions>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={t("sidebar.offerMenuAria", {
                defaultValue: "Offer actions",
              })}
              className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
              title={t("sidebar.offerMenuAria", {
                defaultValue: "Offer actions",
              })}
              type="button"
              variant="ghost"
              {...shellSecondaryNavItemProps}
            >
              <MoreHorizontal aria-hidden className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-40 rounded-lg p-0"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenuItem
              className="h-8 justify-start text-xs"
              onSelect={() => navigate(offerSidebarPath(offer))}
              {...shellSecondaryNavItemProps}
            >
              <ExternalLink className="mr-2 h-3.5 w-3.5" />
              {t("sidebar.openOffer", { defaultValue: "Open offer" })}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="h-8 justify-start text-destructive text-xs focus:bg-destructive/10 focus:text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive"
              onSelect={() => onDelete(offer.id)}
              {...shellSecondaryNavItemProps}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              {t("delete", { defaultValue: "Delete" })}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarRowActions>
    </SidebarRow>
  );
}

interface OffersSidebarGroupedListProps {
  emptyLabel: string;
  groups: OffersListGroup[];
  renderItem: (item: OfferListItem) => ReactNode;
}

export function OffersSidebarGroupedList({
  emptyLabel,
  groups,
  renderItem,
}: OffersSidebarGroupedListProps) {
  const totalCount = groups.reduce((sum, g) => sum + g.offers.length, 0);

  if (totalCount === 0) {
    return (
      <p
        className={cn(
          sidebarColumnContentInsetClassName,
          "text-muted-foreground text-xs"
        )}
      >
        {emptyLabel}
      </p>
    );
  }

  return (
    <SidebarNavList>
      {groups.map((group) => (
        <div className="contents" key={group.key}>
          {group.label ? (
            <SidebarNavSectionLabel>
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate">{group.label}</span>
                <span className="shrink-0 text-muted-foreground text-xxs">
                  ({group.offers.length})
                </span>
              </span>
            </SidebarNavSectionLabel>
          ) : null}
          {group.offers.map((item) => renderItem(item))}
        </div>
      ))}
    </SidebarNavList>
  );
}

interface OffersSidebarDeleteDialogProps {
  deletingId: string | null;
  onClose: () => void;
  onConfirm: (id: string) => Promise<void>;
}

export function OffersSidebarDeleteDialog({
  deletingId,
  onClose,
  onConfirm,
}: OffersSidebarDeleteDialogProps) {
  const { t } = useTranslation("offers");

  return (
    <AlertDialog
      onOpenChange={(open) => !open && onClose()}
      open={deletingId !== null}
    >
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("sidebar.deleteConfirm", {
              defaultValue: "Delete this offer?",
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("sidebar.deleteConfirmDescription", {
              defaultValue: "This action cannot be undone.",
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            {t("cancel", { defaultValue: "Cancel" })}
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={!deletingId}
            onClick={() => deletingId && void onConfirm(deletingId)}
          >
            {t("delete", { defaultValue: "Delete" })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
