import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@engenty/ui-core";

export function ContactsFolderEmpty({
  hasSearch,
  onClearSearch,
}: {
  hasSearch: boolean;
  onClearSearch: () => void;
}) {
  const { t } = useTranslation("contacts");
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon" />
        <EmptyTitle>
          {hasSearch
            ? t("spaceData.folder.noResults", {
                defaultValue: "No matching contacts",
              })
            : t("spaceData.folder.empty", {
                defaultValue: "No contacts here yet.",
              })}
        </EmptyTitle>
        {hasSearch ? (
          <EmptyDescription>
            {t("spaceData.folder.noResultsHint", {
              defaultValue: "Try a different search.",
            })}
          </EmptyDescription>
        ) : null}
      </EmptyHeader>
      {hasSearch ? (
        <EmptyContent>
          <Button onClick={onClearSearch} variant="outline">
            {t("spaceData.folder.clearSearch", {
              defaultValue: "Clear search",
            })}
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}
