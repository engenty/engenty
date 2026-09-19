// The specialist's one page below Chat: who it IS (one identity card — name
// with the same module pill as the desk header, mandate, the id facts — at
// the top, no section heading), then what it DOES
// (routines, its own Actions, tasks), then its capabilities. One tab, so a
// hire's proposed workflow, the routine that fires it and the mandate it runs
// under are read in one scroll.
//
// A CUSTOM specialist is editable in place — the point of the tab is that
// routine care never requires leaving the Space: the mandate saves on blur,
// the engenty swaps from a picker on the blob itself, skills bind from a
// dialog. Structure beyond that (tools, instruction files, model, workspace)
// keeps its one editor on the admin page, which this links to; a
// module-managed agent stays read-only throughout, because its mandate is
// code that shipped.
import type { AgentDeskAgent } from "@engenty/ai-core/browser";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  Button,
  CardSection,
  EditableText,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@engenty/ui-core";
import { Cable, ExternalLink, Sparkles } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AgentFace } from "../../components/agent-face.js";
import { useUpdateCustomAgentMutation } from "../../lib/admin/ai-runtime-queries.js";
import {
  useAiInstructionResolutionQuery,
  useResetAiInstructionMutation,
  useUpdateAiInstructionMutation,
} from "../../lib/admin/instruction-settings-queries.js";
import { AgentEngentyPicker } from "../agent-form/agent-engenty-picker.js";
import { AgentModuleBadge } from "../agents-workspace/agent-badges.js";
import { AgentConnectionsPanel } from "../agents-workspace/agent-connections-panel.js";
import { AgentIdentityRow } from "../agents-workspace/agent-identity-card.js";
import { buildAgentDetailPath } from "../agents-workspace/agent-workspace-paths.js";
import {
  AgentMemorySection,
  AgentTasksSection,
} from "./agent-memory-sections.js";
import { AgentPadSection } from "./agent-pad-section.js";
import { AgentRecentRuns } from "./agent-runs-panel.js";
import { AgentSkillsDialog } from "./agent-skills-dialog.js";
import { AgentWorkSections } from "./agent-work-sections.js";

function Chips({
  chips,
  empty,
  icon,
}: {
  chips: { id: string; label: string }[];
  empty: string;
  icon: ReactNode;
}) {
  if (chips.length === 0) {
    return <p className="text-muted-foreground text-sm">{empty}</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <Badge className="gap-1" key={chip.id} variant="secondary">
          {icon}
          {chip.label}
        </Badge>
      ))}
    </div>
  );
}

export function AgentManagePanel({
  agent,
  canEditPads,
  canManage,
  locale = "en",
  moduleLabel,
  spaceId,
}: {
  agent: AgentDeskAgent;
  /**
   * MEMORY.md / TASKS.md are this agent's state in THIS Space, not its
   * definition — a module agent's identity is read-only, its pads are not.
   */
  canEditPads: boolean;
  canManage: boolean;
  locale?: string;
  /** Display name of `agent.managed_by_module`, as the sidebar labels it. */
  moduleLabel?: string;
  spaceId: string;
}) {
  const { t } = useTranslation("ai-ui");
  const description = agent.description?.trim() ?? "";
  const editable = canManage && agent.source === "database";
  const update = useUpdateCustomAgentMutation();
  // null = untouched; a string while the textarea holds an unsaved edit. The
  // edit saves on blur and the draft is kept until the refetch lands, so the
  // text never flashes back to the old value mid-save.
  const [draft, setDraft] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  // The work sections swap to a routine's setup in place; the identity half
  // yields the tab while one is open. An open Action is a MODAL over the
  // current view, so it hides nothing.
  const [searchParams] = useSearchParams();
  const subviewOpen = Boolean(searchParams.get("routine"));

  const workSections = <AgentWorkSections agentId={agent.id} locale={locale} />;
  if (subviewOpen) {
    return workSections;
  }

  return (
    <div className="flex flex-col gap-5">
      {/* One identity card, no heading — who this agent is, at drawer density
          (offers sidebar: small mascot, text-lg name, compact KV rows). */}
      <CardSection>
        <CardSection.Body>
          <div className="flex items-start gap-3">
            {editable ? (
              <Popover onOpenChange={setPickerOpen} open={pickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    aria-label={t("agentForm.engentyField")}
                    className="shrink-0 rounded-lg transition-colors hover:bg-muted/50"
                    type="button"
                  >
                    <AgentFace
                      avatarUrl={agent.avatarUrl}
                      kind={agent.engenty}
                      name={agent.name}
                      size={40}
                    />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto max-w-md">
                  <AgentEngentyPicker
                    onChange={(kind) => {
                      update.mutate({
                        agentId: agent.id,
                        patch: { engenty: kind },
                      });
                      setPickerOpen(false);
                    }}
                    value={agent.engenty}
                  />
                </PopoverContent>
              </Popover>
            ) : (
              <span
                aria-label={t("agentDesk.engentyLabel", {
                  name: agent.engenty,
                })}
                className="shrink-0"
                role="img"
              >
                <AgentFace
                  avatarUrl={agent.avatarUrl}
                  kind={agent.engenty}
                  name={agent.name}
                  size={40}
                />
              </span>
            )}
            <div className="min-w-0 flex-1 space-y-1">
              {editable ? (
                <EditableText
                  aria-label={t("agentDesk.manage.nameLabel")}
                  as="h2"
                  className="w-full min-w-0 font-semibold text-lg tracking-tight"
                  onSave={(text) => {
                    const next = text.trim();
                    if (!next || next === agent.name) {
                      setNameDraft(null);
                      return;
                    }
                    setNameDraft(next);
                    update.mutate(
                      { agentId: agent.id, patch: { name: next } },
                      { onSettled: () => setNameDraft(null) }
                    );
                  }}
                  placeholder={t("agentDesk.manage.nameLabel")}
                  value={nameDraft ?? agent.name}
                  variant="hover"
                />
              ) : (
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h2 className="min-w-0 font-semibold text-lg tracking-tight">
                    {agent.name}
                  </h2>
                  {agent.source === "module" && agent.managed_by_module ? (
                    <AgentModuleBadge
                      label={moduleLabel}
                      moduleId={agent.managed_by_module}
                    />
                  ) : null}
                </div>
              )}
              {editable ? (
                <EditableText
                  aria-label={t("agentDesk.manage.mandateTitle")}
                  as="p"
                  className="w-full min-w-0 whitespace-pre-wrap text-sm leading-snug"
                  onEnter={() => {
                    // Allow newlines — same as skill/workflow description fields.
                  }}
                  onSave={(text) => {
                    const next = text.trim();
                    if (next === description) {
                      setDraft(null);
                      return;
                    }
                    setDraft(next);
                    update.mutate(
                      { agentId: agent.id, patch: { description: next } },
                      { onSettled: () => setDraft(null) }
                    );
                  }}
                  placeholder={t("agentDesk.manage.descriptionPlaceholder")}
                  value={draft ?? description}
                  variant="hover"
                />
              ) : description ? (
                <p className="whitespace-pre-wrap text-muted-foreground text-sm leading-snug">
                  {description}
                </p>
              ) : (
                <p className="text-muted-foreground text-sm">
                  {t("agentDesk.manage.noDescription")}
                </p>
              )}
              {update.isError ? (
                <p className="text-destructive text-xs">
                  {update.error instanceof Error
                    ? update.error.message
                    : t("agentDesk.manage.saveFailed")}
                </p>
              ) : null}
            </div>
          </div>
          <dl className="m-0 grid gap-2">
            <AgentIdentityRow
              compact
              label={t("agentDesk.manage.idLabel")}
              value={agent.id}
            />
            {agent.managed_by_module ? (
              <AgentIdentityRow
                compact
                label={t("agentDesk.manage.managedByLabel")}
                value={agent.managed_by_module}
              />
            ) : null}
          </dl>
        </CardSection.Body>
      </CardSection>

      {workSections}

      <CardSection
        cardVariant="compact"
        description={t("agentDesk.manage.skillsDescription")}
        headerVariant="compact"
        title={t("agentDesk.skills")}
        titleAction={
          editable ? (
            <Button
              onClick={() => setSkillsOpen(true)}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t("agentDesk.manage.editSkills")}
            </Button>
          ) : undefined
        }
      >
        <Chips
          chips={agent.skills}
          empty={t("agentDesk.manage.noSkills")}
          icon={<Sparkles className="size-3" />}
        />
        {editable ? (
          <AgentSkillsDialog
            agentId={agent.id}
            onOpenChange={setSkillsOpen}
            open={skillsOpen}
            skillIds={agent.skills.map((chip) => chip.id)}
          />
        ) : null}
      </CardSection>

      <CardSection
        cardVariant="compact"
        description={t("agentDesk.manage.connectorsDescription")}
        headerVariant="compact"
        title={t("agentDesk.connectors")}
      >
        <Chips
          chips={agent.connectors}
          empty={t("agentDesk.manage.noConnectors")}
          icon={<Cable className="size-3" />}
        />
      </CardSection>

      {/* Every agent with an audience has both pads (the route answers
          `enabled: false` for one without); a person who can manage the
          space may correct them, whichever module or hire the agent is. */}
      <AgentInstructionsSection agentId={agent.id} editable={canEditPads} />
      <AgentMemorySection
        agentId={agent.id}
        editable={canEditPads}
        spaceId={spaceId}
      />
      <AgentTasksSection
        agentId={agent.id}
        editable={canEditPads}
        spaceId={spaceId}
      />

      {/* Which ACCOUNTS the agent may reach unattended — the full grant
          panel, not a chip list. Granting stays owner-gated server-side, so
          rendering it here widens nothing. */}
      {canManage ? (
        <CardSection
          cardVariant="flush"
          description={t("agentConnections.description")}
          headerVariant="compact"
          title={t("agentConnections.title")}
        >
          <AgentConnectionsPanel agentId={agent.id} />
        </CardSection>
      ) : null}

      {/* What the agent has actually done, last three. The full feed is its
          own drawer — a tab strip over the settings made the two read as one
          page they are not. */}
      <AgentRecentRuns agentId={agent.id} locale={locale} />

      {canManage ? (
        <Button asChild size="sm" variant="outline">
          <Link to={buildAgentDetailPath(agent.id)}>
            {t("agentDesk.manage.openAdmin")}
            <ExternalLink className="ml-1.5 size-3.5" />
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

/**
 * AGENTS.md — the agent's standing instructions, resolved the way a run
 * resolves them: the registry's own text (module code, or the hire's row)
 * under the tenant override, if one exists. Saving writes that override, so
 * it holds for everyone in the tenant and the module's text stays intact;
 * "reset" drops the override. Same document + API as Settings → Instructions
 * (`apps/ai/src/ai/instructions/base-documents.ts` names the key).
 */
function AgentInstructionsSection({
  agentId,
  editable,
}: {
  agentId: string;
  editable: boolean;
}) {
  const { t } = useTranslation("ai-ui");
  const documentKey = `${agentId}.agents`;
  const resolution = useAiInstructionResolutionQuery(documentKey, "tenant");
  const update = useUpdateAiInstructionMutation();
  const reset = useResetAiInstructionMutation();
  const stored =
    resolution.data?.effective_document?.body ??
    resolution.data?.base_document.body ??
    "";
  const overridden = Boolean(resolution.data?.tenant_override);
  return (
    <AgentPadSection
      badge={overridden ? t("agentDesk.manage.instructionsOverridden") : null}
      clear={{
        disabled: !overridden || reset.isPending,
        run: (onSuccess) =>
          reset.mutate({ documentKey, scope: "tenant" }, { onSuccess }),
      }}
      editable={editable}
      enabled={resolution.isError ? false : Boolean(resolution.data)}
      kind="instructions"
      save={{
        error: update.error,
        isError: update.isError,
        isPending: update.isPending,
        mutate: (body, options) =>
          update.mutate({ body, documentKey, scope: "tenant" }, options),
      }}
      stored={stored}
    />
  );
}
