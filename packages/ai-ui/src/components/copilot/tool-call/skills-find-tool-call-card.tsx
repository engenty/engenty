"use client";

// In-chat install card for `skills_find` — same pattern as the connections
// connect card: the agent offers hits, the user clicks Install, the catalog
// (and optional space/agent attach) updates, then chat continues.

import { useTranslation } from "@engenty/i18n/ui";
import { Button, Checkbox } from "@engenty/ui-core";
import { CheckCircle2, Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { useInstallAiSkillMutation } from "../../../lib/admin/ai-runtime-queries.js";
import { useCopilotToolCallActions } from "../interrupts/copilot-tool-call-actions";
import type { SkillsFindHit } from "./skills-find-output.js";
import { parseSkillsFindOutput } from "./skills-find-output.js";
import type { ToolCallCardProps } from "./tool-call-card.types";

export {
  matchesSkillsFindOutput,
  parseSkillsFindOutput,
} from "./skills-find-output.js";

export function SkillsFindToolCallCard(props: ToolCallCardProps) {
  const { t } = useTranslation("ai-ui");
  const { submitMessage } = useCopilotToolCallActions();
  const installMutation = useInstallAiSkillMutation();
  const data = parseSkillsFindOutput(props.output);
  const [installingRef, setInstallingRef] = useState<string | null>(null);
  const [installedNames, setInstalledNames] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [addToSpace, setAddToSpace] = useState(true);
  const [addToAgent, setAddToAgent] = useState(true);

  if (!data) {
    return null;
  }

  const canPrefer = data.attach.agent?.can_prefer === true;
  const spaceId = addToSpace ? data.attach.space?.id : undefined;
  const agentId = addToAgent && canPrefer ? data.attach.agent?.id : undefined;

  const onInstall = async (hit: SkillsFindHit) => {
    setError(null);
    setInstallingRef(hit.ref.id);
    try {
      await installMutation.mutateAsync({
        provider: data.provider.id,
        ref: { id: hit.ref.id },
        ...(spaceId || agentId
          ? {
              attach: {
                ...(agentId ? { agentId } : {}),
                ...(spaceId ? { spaceId } : {}),
              },
            }
          : {}),
      });
      setInstalledNames((prev) => new Set(prev).add(hit.name));
      submitMessage?.(t("skillsFindCard.continueMessage", { name: hit.name }));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("skillsFindCard.installFailed")
      );
    } finally {
      setInstallingRef(null);
    }
  };

  return (
    <section className="my-1 w-full rounded-xl border border-border bg-card p-3.5 shadow-sm">
      <p className="font-semibold text-foreground text-sm">
        {t("skillsFindCard.title", { query: data.query })}
      </p>
      <p className="mt-0.5 text-muted-foreground text-xs">
        {t("skillsFindCard.via", { provider: data.provider.label })}
      </p>
      {data.attach.space || canPrefer ? (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
          {data.attach.space ? (
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Checkbox
                aria-label={t("skillsFindCard.addToSpace")}
                checked={addToSpace}
                onCheckedChange={(checked) => setAddToSpace(checked === true)}
              />
              {t("skillsFindCard.addToSpace")}
            </div>
          ) : null}
          {canPrefer ? (
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Checkbox
                aria-label={t("skillsFindCard.addToAgent")}
                checked={addToAgent}
                onCheckedChange={(checked) => setAddToAgent(checked === true)}
              />
              {t("skillsFindCard.addToAgent")}
            </div>
          ) : null}
        </div>
      ) : null}
      {data.results.length === 0 ? (
        <p className="mt-3 text-muted-foreground text-sm">
          {t("skillsFindCard.empty", { query: data.query })}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {data.results.map((hit) => {
            const installed =
              hit.already_installed || installedNames.has(hit.name);
            const busy = installingRef === hit.ref.id;
            return (
              <li
                className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0"
                key={hit.ref.id}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground text-sm">
                    {hit.name}
                  </p>
                  {hit.description ? (
                    <p className="mt-0.5 line-clamp-2 text-muted-foreground text-xs">
                      {hit.description}
                    </p>
                  ) : null}
                </div>
                {installed ? (
                  <span className="flex shrink-0 items-center gap-1 text-emerald-700 text-xs dark:text-emerald-400">
                    <CheckCircle2 className="size-3.5" />
                    {hit.already_in_space
                      ? t("skillsFindCard.inSpace")
                      : t("skillsFindCard.installed")}
                  </span>
                ) : (
                  <Button
                    disabled={busy}
                    onClick={() => void onInstall(hit)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {busy ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Download className="size-3.5" />
                    )}
                    {busy
                      ? t("skillsFindCard.installing")
                      : t("skillsFindCard.install")}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {error ? (
        <p className="mt-2 text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
