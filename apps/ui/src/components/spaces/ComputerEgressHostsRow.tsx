import { useTranslation } from "@engenty/i18n/ui";
import {
  COMPUTER_EGRESS_HOSTS_MAX,
  parseComputerEgressHost,
} from "@engenty/plugin-sdk";
import { Textarea } from "@engenty/ui-core";
import { useEffect, useState } from "react";

function linesOf(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * The hosts this Space's computer may reach beyond the shared registry list —
 * one per line, saved when the field loses focus. Only a Space whose computer
 * has internet access has a use for it.
 */
export function ComputerEgressHostsRow({
  disabled,
  hosts,
  onSave,
}: {
  disabled: boolean;
  hosts: readonly string[];
  onSave: (hosts: string[]) => void;
}) {
  const { t } = useTranslation("common");
  const saved = hosts.join("\n");
  const [draft, setDraft] = useState(saved);
  // Keyed on the text, not the array: a caller's `?? []` is a new array on
  // every render and would wipe what the person is typing.
  useEffect(() => {
    setDraft(saved);
  }, [saved]);

  const lines = linesOf(draft);
  const invalid = lines.filter((line) => !parseComputerEgressHost(line));
  const tooMany = lines.length > COMPUTER_EGRESS_HOSTS_MAX;

  const commit = () => {
    if (invalid.length > 0 || tooMany) {
      return;
    }
    const next = [
      ...new Set(lines.map((line) => parseComputerEgressHost(line) ?? line)),
    ].sort();
    if (next.join("\n") !== [...hosts].sort().join("\n")) {
      onSave(next);
    }
  };

  return (
    <div className="space-y-1.5 px-4 py-3">
      <label
        className="font-medium text-foreground text-sm"
        htmlFor="space-computer-egress-hosts"
      >
        {t("spaces.settings.egressHostsTitle")}
      </label>
      <p
        className="text-muted-foreground text-xs"
        id="space-computer-egress-hosts-hint"
      >
        {t("spaces.settings.egressHostsHint")}
      </p>
      <Textarea
        aria-describedby="space-computer-egress-hosts-hint"
        aria-invalid={invalid.length > 0 || tooMany}
        className="min-h-[72px] font-mono text-xs"
        disabled={disabled}
        id="space-computer-egress-hosts"
        onBlur={commit}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={"api.example.com\n*.example.org"}
        spellCheck={false}
        value={draft}
      />
      {invalid.length > 0 ? (
        <p className="text-destructive text-xs">
          {t("spaces.settings.egressHostsInvalid", {
            hosts: invalid.join(", "),
          })}
        </p>
      ) : null}
      {tooMany ? (
        <p className="text-destructive text-xs">
          {t("spaces.settings.egressHostsTooMany", {
            max: COMPUTER_EGRESS_HOSTS_MAX,
          })}
        </p>
      ) : null}
    </div>
  );
}
