import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@engenty/ui-core";
import { Layers } from "lucide-react";
import { Link } from "react-router-dom";
import type {
  AiAgentEntry,
  AiRegisteredAction,
  AiSkillCatalogEntry,
} from "../../lib/admin/ai-runtime-api";
import {
  getResolvedAgentSkillItems,
  type ResolvedSkillItem,
} from "./agent-skill-resolution";
import { buildSkillDetailPath } from "./agent-workspace-url-state";

interface AgentSkillsPanelProps {
  actions: AiRegisteredAction[];
  agent: AiAgentEntry | null;
  /** Lighter layout: hide intro copy, management callout, and stat tiles. */
  compact?: boolean;
  /** No outer Card — use inside `SettingsFormSection` or similar. */
  embedded?: boolean;
  isLoading: boolean;
  skills: AiSkillCatalogEntry[];
  t: (key: string) => string;
}

function SkillSection(props: {
  emptyLabel: string;
  /** When true, compact list rows for use inside agent settings (matches Tools list density). */
  flatRows?: boolean;
  items: ResolvedSkillItem[];
  title: string;
  t: (key: string) => string;
}) {
  const rowClassName = props.flatRows
    ? "rounded-md bg-muted/25 p-3"
    : "rounded-md border p-3";

  if (props.flatRows) {
    return (
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-3 border-border border-b bg-muted/15 px-4 py-3">
          <p className="font-medium text-sm">{props.title}</p>
          <Badge variant="outline">{props.items.length}</Badge>
        </div>
        {props.items.length ? (
          <ul className="m-0 list-none divide-y divide-border p-0">
            {props.items.map((skill) => {
              const rowTitle = [skill.name, skill.description]
                .filter(Boolean)
                .join("\n");
              return (
                <li
                  className="flex gap-3 px-4 py-3 sm:py-2.5"
                  key={`${props.title}:${skill.id}`}
                  title={rowTitle || undefined}
                >
                  <Layers
                    aria-hidden
                    className="mt-1 size-3.5 shrink-0 text-muted-foreground"
                    strokeWidth={1.75}
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <Link
                      className="block break-words font-medium text-sm transition-colors hover:text-primary"
                      to={buildSkillDetailPath(skill.id)}
                    >
                      {skill.name}
                    </Link>
                    {skill.description ? (
                      <p className="break-words text-muted-foreground text-xs leading-relaxed">
                        {skill.description}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-4 py-4 text-muted-foreground text-sm sm:py-5">
            {props.emptyLabel}
          </p>
        )}
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium text-sm">{props.title}</p>
        <Badge variant="outline">{props.items.length}</Badge>
      </div>

      {props.items.length ? (
        <div className="space-y-2">
          {props.items.map((skill) => (
            <div className={rowClassName} key={skill.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <Link
                    className="font-medium text-sm transition-colors hover:text-primary"
                    to={buildSkillDetailPath(skill.id)}
                  >
                    {skill.name}
                  </Link>
                </div>
                <div className="flex flex-wrap gap-2">
                  {skill.fromAgent ? (
                    <Badge variant="secondary">
                      {props.t("skills.badge.agent")}
                    </Badge>
                  ) : null}
                  {skill.actionNames.length ? (
                    <Badge variant="secondary">
                      {props.t("skills.badge.action")}:{" "}
                      {skill.actionNames.length}
                    </Badge>
                  ) : null}
                  {skill.isKnown ? null : (
                    <Badge variant="secondary">
                      {props.t("skills.unknownBadge")}
                    </Badge>
                  )}
                </div>
              </div>
              {skill.description ? (
                <p className="mt-2 text-muted-foreground text-sm">
                  {skill.description}
                </p>
              ) : null}
              {skill.license ? (
                <p className="mt-1 text-muted-foreground text-xs">
                  License: {skill.license}
                </p>
              ) : null}
              {skill.compatibility ? (
                <p className="mt-1 text-muted-foreground text-xs">
                  Compatibility: {skill.compatibility}
                </p>
              ) : null}
              {skill.fromAgent ? (
                <p className="mt-2 text-muted-foreground text-xs">
                  {props.t("skills.reasonAgent")}
                </p>
              ) : null}
              {skill.actionNames.length ? (
                <p className="mt-1 text-muted-foreground text-xs">
                  {props.t("skills.reasonAction")}:{" "}
                  {skill.actionNames.join(", ")}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">{props.emptyLabel}</p>
      )}
    </section>
  );
}

export function AgentSkillsPanel({
  skills,
  actions,
  agent,
  compact = false,
  embedded = false,
  isLoading,
  t,
}: AgentSkillsPanelProps) {
  if (!agent) {
    if (embedded) {
      return (
        <p className="px-4 py-4 text-muted-foreground text-sm sm:py-5">
          {t("agents.selectHint")}
        </p>
      );
    }
    return (
      <Card className="flex min-h-0 flex-1 flex-col" variant="panel">
        <CardHeader className="p-0">
          <CardTitle className="text-base">
            {t("workspace.skillsTab")}
          </CardTitle>
          <CardDescription>{t("agents.selectHint")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { agentSkills, actionDerivedSkills } = getResolvedAgentSkillItems({
    actions,
    agent,
    skills,
    t,
  });

  const body = (
    <>
      {isLoading ? (
        <p
          className={
            embedded
              ? "border-border border-b px-4 py-3.5 text-muted-foreground text-xs sm:py-4"
              : "text-muted-foreground text-sm"
          }
        >
          {t("skills.loadingActionCapabilities")}
        </p>
      ) : null}

      {embedded || compact ? null : (
        <>
          <div className="rounded-md border border-dashed bg-muted/20 p-3">
            <p className="font-medium text-sm">{t("skills.managementTitle")}</p>
            <p className="mt-1 text-muted-foreground text-sm">
              {t("skills.managementDescription")}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border bg-muted/20 p-3">
              <p className="text-muted-foreground text-xs uppercase tracking-wide">
                {t("skills.agentTitle")}
              </p>
              <p className="mt-1 font-semibold text-lg">{agentSkills.length}</p>
            </div>
            <div className="rounded-md border bg-muted/20 p-3">
              <p className="text-muted-foreground text-xs uppercase tracking-wide">
                {t("skills.derivedTitle")}
              </p>
              <p className="mt-1 font-semibold text-lg">
                {actionDerivedSkills.length}
              </p>
            </div>
          </div>
        </>
      )}

      <SkillSection
        emptyLabel={t("skills.agentEmpty")}
        flatRows={embedded}
        items={agentSkills}
        t={t}
        title={t("skills.agentTitle")}
      />
      <SkillSection
        emptyLabel={t("skills.derivedEmpty")}
        flatRows={embedded}
        items={actionDerivedSkills}
        t={t}
        title={t("skills.derivedTitle")}
      />
    </>
  );

  if (embedded) {
    return <div className="divide-y divide-border">{body}</div>;
  }

  return (
    <Card className="flex min-h-0 flex-1 flex-col" variant="panel">
      {compact ? null : (
        <CardHeader className="p-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle>{t("workspace.skillsTab")}</CardTitle>
              <CardDescription>{t("skills.description")}</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                {t("skills.summary.agent")}: {agentSkills.length}
              </Badge>
              <Badge variant="outline">
                {t("skills.summary.derived")}: {actionDerivedSkills.length}
              </Badge>
            </div>
          </div>
        </CardHeader>
      )}
      <CardContent className="space-y-6 p-0">{body}</CardContent>
    </Card>
  );
}

export { AgentEffectiveToolsPanel } from "./agent-effective-tools-panel";
export type { ResolvedSkillItem } from "./agent-skill-resolution";
export { getResolvedAgentSkillItems } from "./agent-skill-resolution";
