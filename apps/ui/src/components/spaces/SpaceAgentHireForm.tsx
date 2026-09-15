/**
 * The hire form: character, name, description, role suggestions.
 *
 * One form, two doors. The roster's "+" opens it in its own dialog
 * (`SpaceAgentHireWizard`); the create-space wizard ends on it, pre-filled
 * with the space's first engenty. Both render these fields and own their
 * buttons; the hook owns the draft and the registry write.
 */
import type { AgentEngentyKind } from "@engenty/ai-core/browser";
import {
  AGENT_ROLE_TEMPLATES,
  type AgentRoleTemplate,
  useCreateCustomAgentMutation,
} from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { SPACE_BASELINE_MOUNTS, spaceMountKey } from "@engenty/plugin-sdk";
import {
  cn,
  Engenty,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@engenty/ui-core";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  useSpaceAgentCatalogQuery,
  useSpaceMountsQuery,
  useSpacesQuery,
} from "@/lib/spaces-queries";
import { SpaceAgentHireCapabilities } from "./SpaceAgentHireCapabilities";
import { SpaceAgentHireCharacter } from "./SpaceAgentHireCharacter";
import {
  buildSpaceAgentHireInput,
  firstEngentyDraft,
  HIRE_TEMPLATE_ENGENTY,
  pickRandomHireEngenty,
  type SpaceAgentHireDraft,
  type SpaceAgentHireTemplate,
} from "./space-agent-hire";

/** Select value for "reports to nobody" — Radix refuses an empty string. */
const NOBODY = "__nobody__";

function asHireTemplate(template: AgentRoleTemplate): SpaceAgentHireTemplate {
  return {
    agentId: template.agentId,
    description: template.description,
    instructions: template.instructions,
    name: template.name,
    skillIds: [],
    templateId: template.templateId,
    toolIds: [...template.toolIds],
  };
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

export interface SpaceAgentHireForm {
  canSubmit: boolean;
  description: string;
  engenty: AgentEngentyKind;
  error: string | null;
  isPending: boolean;
  name: string;
  pickSuggestion: (template: SpaceAgentHireTemplate) => void;
  /** Agent key this hire reports to; null = nobody. */
  reportsTo: string | null;
  /** The engenties already hired here — the ones a new hire can report to. */
  reportsToOptions: { id: string; name: string }[];
  setDescription: (value: string) => void;
  setEngenty: (value: AgentEngentyKind) => void;
  setName: (value: string) => void;
  setReportsTo: (value: string | null) => void;
  spaceId: string;
  /** Creates and mounts the engenty; resolves to its id, or null on error. */
  submit: () => Promise<{ id: string; threadId: string | null } | null>;
  template: SpaceAgentHireTemplate | null;
}

/**
 * Draft + write. `initial` seeds the fields each time `active` turns true;
 * absent, the form starts blank with a random character.
 */
export function useSpaceAgentHireForm({
  active,
  initial,
  spaceId,
}: {
  active: boolean;
  initial?: SpaceAgentHireDraft | null;
  spaceId: string;
}): SpaceAgentHireForm {
  const { t } = useTranslation("common");
  const create = useCreateCustomAgentMutation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [engenty, setEngenty] = useState<AgentEngentyKind>("round");
  const [template, setTemplate] = useState<SpaceAgentHireTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reportsTo, setReportsTo] = useState<string | null>(null);
  const mountsQuery = useSpaceMountsQuery(active && spaceId ? spaceId : null);
  const agentCatalog = useSpaceAgentCatalogQuery(active && Boolean(spaceId));
  // Hired engenties = the explicit agent mounts that are not platform
  // baseline (the copilot and its sub-agents are mounted everywhere and are
  // nobody's manager). Oldest first, so the first engenty is the default.
  const reportsToOptions = useMemo(() => {
    const baseline = new Set(SPACE_BASELINE_MOUNTS.map(spaceMountKey));
    const names = new Map(
      (agentCatalog.data ?? []).map((agent) => [agent.id, agent.name])
    );
    return (mountsQuery.data ?? [])
      .filter(
        (mount) =>
          mount.resourceType === "agent" && !baseline.has(spaceMountKey(mount))
      )
      .toSorted((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((mount) => ({
        id: mount.resourceKey,
        name: names.get(mount.resourceKey) ?? mount.resourceKey,
      }));
  }, [agentCatalog.data, mountsQuery.data]);

  useEffect(() => {
    if (!active) {
      return;
    }
    setName(initial?.name ?? "");
    setDescription(initial?.description ?? "");
    setEngenty(initial?.engenty ?? pickRandomHireEngenty());
    setTemplate(initial?.template ?? null);
    setReportsTo(initial?.reportsTo ?? null);
    setError(null);
  }, [active, initial]);

  // Default to the first engenty once the mounts arrive, unless the draft
  // already says who — a person can still pick "nobody".
  const [reportsToDefaulted, setReportsToDefaulted] = useState(false);
  useEffect(() => {
    if (!active) {
      setReportsToDefaulted(false);
      return;
    }
    if (reportsToDefaulted || initial?.reportsTo !== undefined) {
      return;
    }
    const first = reportsToOptions[0];
    if (first) {
      setReportsTo(first.id);
      setReportsToDefaulted(true);
    }
  }, [active, initial?.reportsTo, reportsToDefaulted, reportsToOptions]);

  const canSubmit = Boolean(name.trim());

  const pickSuggestion = (picked: SpaceAgentHireTemplate) => {
    setTemplate(picked);
    setName(picked.name);
    setDescription(picked.description);
    setEngenty(HIRE_TEMPLATE_ENGENTY[picked.templateId] ?? "round");
    setError(null);
  };

  const submit = async (): Promise<{
    id: string;
    threadId: string | null;
  } | null> => {
    if (!canSubmit) {
      return null;
    }
    setError(null);
    try {
      const result = await create.mutateAsync(
        buildSpaceAgentHireInput(
          { description, engenty, name, reportsTo, template },
          spaceId
        )
      );
      const mountedHere = result.mounted.some(
        (row) => row.ok && row.spaceId === spaceId
      );
      if (!mountedHere) {
        setError(
          t("spaces.agents.wizard.mountFailed", {
            defaultValue:
              "The agent was created but could not be added to this space.",
          })
        );
        return null;
      }
      return {
        id: result.agent.id,
        threadId:
          result.welcome?.find((row) => row.spaceId === spaceId)?.threadId ??
          null,
      };
    } catch (caught) {
      setError(
        getErrorMessage(
          caught,
          t("spaces.agents.wizard.createFailed", {
            defaultValue: "Could not create this agent.",
          })
        )
      );
      return null;
    }
  };

  return {
    canSubmit,
    description,
    engenty,
    error,
    isPending: create.isPending,
    name,
    pickSuggestion,
    reportsTo,
    reportsToOptions,
    setDescription,
    setEngenty,
    setName,
    setReportsTo,
    spaceId,
    submit,
    template,
  };
}

/** A card in the suggestions grid: the template, and a line under its name. */
interface HireSuggestion {
  hint: string;
  template: SpaceAgentHireTemplate;
}

/**
 * The Chief of Staff first — the first engenty's template, the way the
 * create-space wizard seeds it — then the role templates. Offered whether or
 * not the space already has a lead: a second top-level engenty is a choice,
 * not an error, and the assembler gives every hire that reports to nobody
 * the same setup and hiring tools anyway.
 */
function useHireSuggestions(spaceId: string): HireSuggestion[] {
  const { t } = useTranslation("common");
  const spaces = useSpacesQuery();
  const spaceName =
    spaces.data?.find((space) => space.id === spaceId)?.name ?? "";
  return useMemo(() => {
    const chief = firstEngentyDraft(spaceName, null).template;
    return [
      ...(chief
        ? [
            {
              hint: t("spaces.agents.wizard.chiefOfStaffHint", {
                defaultValue: "Sets the space up, routes work, hires teammates",
              }),
              template: chief,
            },
          ]
        : []),
      ...AGENT_ROLE_TEMPLATES.map((role) => ({
        hint: role.hint,
        template: asHireTemplate(role),
      })),
    ];
  }, [spaceName, t]);
}

export function SpaceAgentHireFields({
  children,
  form,
}: {
  /** Rendered between the fields and the suggestions — the submit button. */
  children?: ReactNode;
  form: SpaceAgentHireForm;
}) {
  const { t } = useTranslation("common");
  const suggestions = useHireSuggestions(form.spaceId);
  return (
    <div className="flex flex-col gap-6">
      <SpaceAgentHireCharacter
        onChange={form.setEngenty}
        value={form.engenty}
      />

      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="space-agent-hire-name">
            {t("spaces.agents.wizard.nameLabel", { defaultValue: "Name" })}
          </Label>
          <Input
            autoComplete="off"
            autoFocus
            id="space-agent-hire-name"
            onChange={(event) => form.setName(event.target.value)}
            placeholder={t("spaces.agents.wizard.namePlaceholder", {
              defaultValue: "Friend",
            })}
            value={form.name}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="space-agent-hire-description">
            {t("spaces.agents.wizard.descriptionLabel", {
              defaultValue: "Description",
            })}
          </Label>
          <Textarea
            className="min-h-20 resize-none"
            id="space-agent-hire-description"
            onChange={(event) => form.setDescription(event.target.value)}
            placeholder={t("spaces.agents.wizard.descriptionPlaceholder", {
              defaultValue:
                "What this agent is for — the standing job it should own in this space.",
            })}
            rows={3}
            value={form.description}
          />
        </div>
        {form.reportsToOptions.length > 0 ? (
          <div className="grid gap-1.5">
            <Label htmlFor="space-agent-hire-reports-to">
              {t("spaces.agents.wizard.reportsToLabel", {
                defaultValue: "Reports to",
              })}
            </Label>
            <Select
              onValueChange={(value) =>
                form.setReportsTo(value === NOBODY ? null : value)
              }
              value={form.reportsTo ?? NOBODY}
            >
              <SelectTrigger id="space-agent-hire-reports-to">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NOBODY}>
                  {t("spaces.agents.wizard.reportsToNone", {
                    defaultValue: "Nobody",
                  })}
                </SelectItem>
                {form.reportsToOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <SpaceAgentHireCapabilities template={form.template} />
        {form.error ? (
          <p className="text-destructive text-xs" role="alert">
            {form.error}
          </p>
        ) : null}
        {children}
      </div>

      <section className="grid gap-2">
        <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          {t("spaces.agents.wizard.suggestions", {
            defaultValue: "Suggestions",
          })}
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {suggestions.map(({ hint, template: role }) => {
            const picked = form.template?.templateId === role.templateId;
            const kind = HIRE_TEMPLATE_ENGENTY[role.templateId] ?? "round";
            return (
              <button
                aria-pressed={picked}
                className={cn(
                  "ui-card-raised flex items-center gap-2.5 p-3 text-left",
                  picked && "ui-card-selected"
                )}
                key={role.templateId}
                onClick={() => form.pickSuggestion(role)}
                type="button"
              >
                <span className="grid size-8 shrink-0 place-items-center">
                  <Engenty
                    className="[&_.e-shadow]:hidden"
                    kind={kind}
                    size={28}
                  />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-sm">{role.name}</span>
                  <span className="mt-0.5 block text-muted-foreground text-xs leading-snug">
                    {hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
