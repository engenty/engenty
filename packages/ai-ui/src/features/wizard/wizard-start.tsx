"use client";

// Page 0 of a wizard: the run's input, derived from its schema.
//
// Nothing is declared for this page. The workflow's input schema becomes a
// surface through the same helper that expands a `field_updates` gate, and
// the same card renders it. A workflow that wants a richer first page has an
// empty schema and a gate as its first node — then this page is skipped and
// the run starts at once.

import { formSurfaceFromSchema } from "@engenty/generative-a2ui";
import { useTranslation } from "@engenty/i18n/ui";
import { useMutation } from "@engenty/query-client";
import { useEffect, useMemo, useRef } from "react";
import type { MentionRefSearch } from "../../components/copilot/composer/use-copilot-composer-mention.js";
import { useAiWorkflowsQuery } from "../../lib/admin/ai-runtime-queries.js";
import {
  isStoredWorkflowId,
  type RunWorkflowResponse,
  runWorkflowByAnyId,
} from "../workflow-canvas/workflow-api.js";
import { useWorkflowQuery } from "../workflow-canvas/workflow-queries.js";
import { GateSurfaceCard } from "./gate-surface-card.js";
import { WizardScreen, WizardWorking } from "./wizard-stage.js";

/** True when a schema asks for nothing — the run can start unprompted. */
export function inputSchemaIsEmpty(
  schema: Record<string, unknown> | null | undefined
): boolean {
  if (!schema) {
    return true;
  }
  const properties = schema.properties;
  return (
    !properties ||
    typeof properties !== "object" ||
    Object.keys(properties as Record<string, unknown>).length === 0
  );
}

export interface WizardStartProps {
  className?: string;
  /** Workspace search behind `ObjectPicker` fields. */
  objectSearch?: MentionRefSearch | null;
  /** The run exists — the host navigates to it. */
  onStarted: (run: RunWorkflowResponse) => void;
  /** Fallback space claim for callers that cannot set the space header. */
  spaceId?: string | null;
  /** A stored uuid or a declared module id (`offers.create`). */
  workflowId: string;
}

/** The input schema and title behind either id shape, once it is known. */
export function useWizardInputSchema(workflowId: string): {
  loading: boolean;
  schema: Record<string, unknown> | null;
  title: string | null;
} {
  const stored = isStoredWorkflowId(workflowId);
  const graphQuery = useWorkflowQuery(stored ? workflowId : undefined);
  const catalogQuery = useAiWorkflowsQuery();
  if (stored) {
    const graph = graphQuery.data?.graph;
    const versions = graphQuery.data?.versions ?? [];
    const current =
      versions.find((v) => v.version === graph?.current_version) ??
      versions.at(-1);
    return {
      loading: graphQuery.isLoading,
      schema: current?.graph.inputSchema ?? null,
      title: graph?.title ?? graph?.name ?? null,
    };
  }
  const row = catalogQuery.data?.workflows.find((w) => w.id === workflowId);
  return {
    loading: catalogQuery.isLoading,
    schema: row?.input_schema_json ?? null,
    title: row?.name ?? null,
  };
}

export function WizardStart({
  className,
  objectSearch,
  onStarted,
  spaceId,
  workflowId,
}: WizardStartProps) {
  const { t } = useTranslation("ai-ui");
  const { loading, schema, title } = useWizardInputSchema(workflowId);
  const start = useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      runWorkflowByAnyId(workflowId, {
        input,
        ...(spaceId ? { space_id: spaceId } : {}),
      }),
    onSuccess: (run) => onStarted(run),
  });

  const surface = useMemo(
    () =>
      inputSchemaIsEmpty(schema)
        ? null
        : formSurfaceFromSchema(schema as Record<string, unknown>, undefined, {
            submitEvent: "start",
            submitLabel: t("wizard.start"),
          }),
    [schema, t]
  );

  // An empty schema has nothing to ask: start once, the moment it is known.
  const autoStartedRef = useRef(false);
  const autoStart = !loading && surface === null;
  useEffect(() => {
    if (!autoStart || autoStartedRef.current) {
      return;
    }
    autoStartedRef.current = true;
    start.mutate({});
  }, [autoStart, start.mutate]);

  if (loading) {
    return (
      <div className={className}>
        <WizardWorking label={t("wizard.state.loading")} />
      </div>
    );
  }

  if (!surface) {
    return (
      <div className={className}>
        {start.isError ? (
          <p className="text-destructive text-sm">
            {start.error instanceof Error
              ? start.error.message
              : t("wizard.error")}
          </p>
        ) : (
          <WizardWorking label={t("wizard.state.starting")} />
        )}
      </div>
    );
  }

  return (
    <WizardScreen className={className}>
      <GateSurfaceCard
        busy={start.isPending}
        gate={{ stepId: "input", surface, title: title ?? undefined }}
        objectSearch={objectSearch}
        onSubmit={(decision) => start.mutate(decision.data)}
        stepNumber={1}
        variant="page"
      />
      {start.isError ? (
        <p className="mt-3 text-destructive text-sm">
          {start.error instanceof Error
            ? start.error.message
            : t("wizard.error")}
        </p>
      ) : null}
    </WizardScreen>
  );
}
