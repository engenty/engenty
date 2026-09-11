import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
} from "@engenty/ui-core";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { SpacePersonDetailsDialog } from "./SpacePersonDetailsDialog";
import { type SpacePersonItem, SpacePersonRow } from "./SpacePersonRow";
import type { SpaceRoster } from "./space-roster";
import { memberLabel } from "./space-roster";

export function SpacePeopleDialog({
  canManage,
  roster,
}: {
  canManage: boolean;
  roster: SpaceRoster;
}) {
  const { t } = useTranslation("common");
  const [query, setQuery] = useState("");
  const [detailsId, setDetailsId] = useState<string | null>(null);

  const people = useMemo<SpacePersonItem[]>(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const items = [
      ...roster.members.map((member) => ({
        email: member.email,
        id: member.userId,
        inSpace: true,
        name: memberLabel(member),
        role: member.role,
      })),
      ...roster.addable.map((person) => ({
        email: person.email,
        id: person.id,
        inSpace: false,
        name: person.displayName?.trim() || person.email,
        role: null,
      })),
    ];
    return items.filter((item) =>
      normalized
        ? `${item.name} ${item.email ?? ""}`
            .toLocaleLowerCase()
            .includes(normalized)
        : true
    );
  }, [query, roster.addable, roster.members]);

  const inSpace = people.filter((item) => item.inSpace);
  const available = people.filter((item) => !item.inSpace);
  const details = people.find((item) => item.id === detailsId) ?? null;
  const saving = roster.addMember.isPending || roster.removeMember.isPending;
  const error =
    roster.addMember.error instanceof Error
      ? roster.addMember.error.message
      : null;

  const renderRow = (item: SpacePersonItem) => (
    <SpacePersonRow
      item={item}
      key={item.id}
      onOpen={() => setDetailsId(item.id)}
      saving={saving}
    />
  );

  return (
    <Dialog onOpenChange={roster.setPickerOpen} open={roster.pickerOpen}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("spaces.members.manageTitle")}</DialogTitle>
          <DialogDescription>
            {t("spaces.members.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label={t("spaces.members.searchPlaceholder")}
            className="pl-8"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("spaces.members.searchPlaceholder")}
            type="search"
            value={query}
          />
        </div>

        <div className="flex-1 overflow-y-auto pr-1">
          <div className="divide-y divide-border">
            {inSpace.length > 0 ? (
              <div className="pb-2">
                <p className="px-2 pb-1 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
                  {t("spaces.members.inSpaceSection")}
                </p>
                {inSpace.map(renderRow)}
              </div>
            ) : null}
            <div className="pt-3">
              <p className="px-2 pb-1 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
                {t("spaces.members.availableSection")}
              </p>
              {roster.directoryPending ? (
                <div className="flex items-center gap-2 px-2 py-6 text-muted-foreground text-sm">
                  <Spinner className="size-4" />
                  {t("spaces.members.loading")}
                </div>
              ) : available.length === 0 && people.length > 0 ? (
                <p className="px-2 py-4 text-muted-foreground text-xs">
                  {t("spaces.members.noneToAdd")}
                </p>
              ) : (
                available.map(renderRow)
              )}
            </div>
            {!roster.directoryPending && people.length === 0 ? (
              <p className="px-2 py-8 text-center text-muted-foreground text-sm">
                {t("spaces.members.noMatches")}
              </p>
            ) : null}
          </div>
        </div>

        {error ? <p className="text-destructive text-xs">{error}</p> : null}
        <DialogFooter>
          <Button
            disabled={saving}
            onClick={() => roster.setPickerOpen(false)}
            type="button"
          >
            {t("actions.close")}
          </Button>
        </DialogFooter>

        <SpacePersonDetailsDialog
          canManage={canManage}
          item={details}
          onAdd={async () => {
            if (!details) {
              return false;
            }
            try {
              await roster.addMember.mutateAsync(details.id);
              return true;
            } catch {
              return false;
            }
          }}
          onOpenChange={(open) => {
            if (!open) {
              setDetailsId(null);
            }
          }}
          onRemove={() => {
            const member = roster.members.find(
              (entry) => entry.userId === details?.id
            );
            if (member) {
              roster.requestRemove(member);
            }
          }}
          open={details !== null}
          saving={saving}
        />
      </DialogContent>
    </Dialog>
  );
}
