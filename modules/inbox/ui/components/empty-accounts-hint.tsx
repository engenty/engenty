// Why-is-my-inbox-empty diagnosis for the thread list's empty state.
//
// An empty inbox has two silent causes the empty state used to say nothing
// about: no mail account is connected at all, or accounts exist but every one
// has autonomous use OFF (the default) — and a connection with autonomy off
// is skipped by the sync entirely, so the list stays empty forever with no
// error anywhere. Name the actual cause and link the fix.
import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { useNavigate } from "react-router-dom";
import { useInboxAccountsQuery } from "../queries.js";

const CONNECTIONS_SETTINGS_PATH = "/settings/connections";

export function EmptyAccountsHint() {
  const { t } = useTranslation("inbox");
  const navigate = useNavigate();
  const accountsQuery = useInboxAccountsQuery();

  const accounts = accountsQuery.data?.accounts;
  if (!accounts) {
    return null;
  }

  const allOff =
    accounts.length > 0 &&
    accounts.every((account) => account.autonomous_mode === "off");
  if (accounts.length > 0 && !allOff) {
    // Accounts exist and at least one may sync — the inbox is just empty.
    return null;
  }

  return (
    <div className="flex flex-col items-center gap-2 pt-1">
      <p className="max-w-[36ch] text-center text-amber-600 text-xs dark:text-amber-500">
        {accounts.length === 0
          ? t("empty.noAccountsHint")
          : t("empty.autonomyOffHint")}
      </p>
      <Button
        onClick={() => navigate(CONNECTIONS_SETTINGS_PATH)}
        size="sm"
        variant="outline"
      >
        {accounts.length === 0
          ? t("empty.connectAccount")
          : t("empty.openConnectionSettings")}
      </Button>
    </div>
  );
}
