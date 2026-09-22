import { requestApiJson } from "@engenty/api-client";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { Button, cn, Input } from "@engenty/ui-core";
import { Check, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { AiSkillRecord } from "../../lib/admin/ai-runtime-types.js";
import { AgentSkillMarketplace } from "./agent-skill-marketplace.js";
import { PackIcon } from "./agent-skill-pack-icon.js";
import { AgentSkillPackageDetail } from "./agent-skill-package-detail.js";
import {
  groupSkills,
  packMatchesQuery,
  type SkillPack,
} from "./agent-skill-packages-model.js";

type SkillsFilter = "all" | "added" | "marketplace";

export function AgentSkillPackages({
  detailsId,
  existingSkillNames,
  onChange,
  onDetailsIdChange,
  onInstalled,
  skills,
  value,
}: {
  detailsId: string | null;
  existingSkillNames: ReadonlySet<string>;
  onChange: (skillIds: string[]) => void;
  onDetailsIdChange: (id: string | null) => void;
  onInstalled: (skillName: string) => void;
  skills: AiSkillRecord[];
  value: string[];
}) {
  const { t } = useTranslation("ai-ui");
  const selected = useMemo(() => new Set(value), [value]);
  const packs = useMemo(() => groupSkills(skills), [skills]);
  const emojis = useModuleEmojis();
  const [filter, setFilter] = useState<SkillsFilter>("all");
  const [query, setQuery] = useState("");
  const openCategory = detailsId?.startsWith("skill:")
    ? detailsId.slice("skill:".length)
    : null;
  const open = packs.find((pack) => pack.category === openCategory);

  const setPack = (names: string[], on: boolean) => {
    const next = new Set(value);
    for (const name of names) {
      if (on) {
        next.add(name);
      } else {
        next.delete(name);
      }
    }
    onChange([...next]);
  };

  const filtered = useMemo(() => {
    const matched = packs.filter((pack) => packMatchesQuery(pack, query));
    if (filter === "added") {
      return matched.filter((pack) =>
        pack.skills.some((skill) => selected.has(skill.name))
      );
    }
    return matched;
  }, [filter, packs, query, selected]);

  if (open) {
    return (
      <AgentSkillPackageDetail
        emoji={moduleEmoji(open, emojis)}
        onToggle={(name, on) => setPack([name], on)}
        onTogglePack={setPack}
        pack={open}
        selected={selected}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["all", t("agentDesk.manage.filterAll", { defaultValue: "All" })],
            [
              "added",
              t("agentDesk.manage.filterAdded", { defaultValue: "Added" }),
            ],
            [
              "marketplace",
              t("agentDesk.manage.filterMarketplace", {
                defaultValue: "Marketplace",
              }),
            ],
          ] as const
        ).map(([id, label]) => (
          <Button
            className={cn(
              "h-7 rounded-full px-3 text-xs",
              filter === id &&
                "bg-foreground text-background hover:bg-foreground/90"
            )}
            key={id}
            onClick={() => setFilter(id)}
            size="sm"
            type="button"
            variant={filter === id ? "default" : "outline"}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label={
            filter === "marketplace"
              ? t("agentDesk.manage.skillsSearchMarketplace", {
                  defaultValue: "Search skills.sh…",
                })
              : t("agentDesk.manage.skillsSearch", {
                  defaultValue: "Search skills…",
                })
          }
          className="pl-8"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={
            filter === "marketplace"
              ? t("agentDesk.manage.skillsSearchMarketplace", {
                  defaultValue: "Search skills.sh…",
                })
              : t("agentDesk.manage.skillsSearch", {
                  defaultValue: "Search skills…",
                })
          }
          type="search"
          value={query}
        />
      </div>
      {filter === "marketplace" ? (
        <AgentSkillMarketplace
          existingSkillNames={existingSkillNames}
          onInstalled={onInstalled}
          query={query}
          setQuery={setQuery}
        />
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {filtered.map((pack) => {
              const names = pack.skills.map((skill) => skill.name);
              const selectedCount = names.filter((name) =>
                selected.has(name)
              ).length;
              const full = selectedCount === names.length && names.length > 0;
              return (
                <div
                  className="flex min-w-0 items-start gap-3 rounded-xl border bg-card p-3"
                  key={pack.category}
                >
                  <PackIcon emoji={moduleEmoji(pack, emojis)} />
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() => onDetailsIdChange(`skill:${pack.category}`)}
                    type="button"
                  >
                    <p className="truncate font-medium text-sm">{pack.title}</p>
                    {pack.description ? (
                      <p className="line-clamp-2 text-muted-foreground text-xs">
                        {pack.description}
                      </p>
                    ) : null}
                    <SkillPreview skills={pack.skills} />
                  </button>
                  {full ? (
                    <button
                      aria-label={t("agentDesk.manage.skillsRemovePackage")}
                      className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      onClick={() => setPack(names, false)}
                      type="button"
                    >
                      <Check className="size-4" />
                    </button>
                  ) : (
                    <Button
                      className="shrink-0"
                      onClick={() => setPack(names, true)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {t("agentDesk.manage.skillsAddPackage")}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-2 py-6">
              <p className="text-center text-muted-foreground text-sm">
                {query.trim()
                  ? t("agentDesk.manage.noMatchingSkills", {
                      defaultValue: "No matching skills.",
                    })
                  : t("agentDesk.manage.noSkills", {
                      defaultValue: "No skills bound.",
                    })}
              </p>
              {query.trim() ? (
                <button
                  className="text-sm underline"
                  onClick={() => setFilter("marketplace")}
                  type="button"
                >
                  {t("agentDesk.manage.searchInMarketplace", {
                    defaultValue: "Search in Marketplace",
                  })}
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function SkillPreview({ skills }: { skills: AiSkillRecord[] }) {
  const { t } = useTranslation("ai-ui");
  const shown = skills.slice(0, 3);
  const more = skills.length - shown.length;
  return (
    <ul className="mt-1 text-muted-foreground text-xs">
      {shown.map((skill) => (
        <li className="truncate" key={skill.name}>
          {skill.title?.trim() || skill.name}
        </li>
      ))}
      {more > 0 ? (
        <li>
          {t("agentDesk.manage.skillsMore", {
            count: more,
            defaultValue: "… {{count}} more",
          })}
        </li>
      ) : null}
    </ul>
  );
}

function useModuleEmojis(): ReadonlyMap<string, string> {
  const query = useQuery({
    queryFn: ({ signal }) =>
      requestApiJson<Array<{ emoji?: string | null; id: string }>>(
        "/api/plugins",
        { signal }
      ),
    queryKey: ["plugins", "module-emojis"],
    staleTime: 60_000,
  });
  return useMemo(() => {
    const map = new Map<string, string>();
    for (const plugin of query.data ?? []) {
      if (plugin.emoji?.trim()) {
        map.set(plugin.id, plugin.emoji.trim());
      }
    }
    return map;
  }, [query.data]);
}

function moduleEmoji(
  pack: SkillPack,
  emojis: ReadonlyMap<string, string>
): string | null {
  const direct = emojis.get(pack.category);
  if (direct) {
    return direct;
  }
  for (const skill of pack.skills) {
    for (const moduleId of skill.engenty_modules ?? []) {
      const emoji = emojis.get(moduleId);
      if (emoji) {
        return emoji;
      }
    }
  }
  return null;
}
