"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CopilotCompactContextOption } from "../composer/copilot-compact-context-option";
import type { CopilotRouteContext } from "../session/copilot-route-context.js";
import { buildCompactContextOptions } from "./copilot-drawer-utils";

export interface UseCopilotDrawerCompactContextInput {
  copilotContext?: CopilotRouteContext;
  module: string;
  routeKey: string;
  scope: Record<string, unknown> | null;
  threadChooserEnabled: boolean;
  title?: string;
}

export function useCopilotDrawerCompactContext(
  input: UseCopilotDrawerCompactContextInput
) {
  const compactContextOptions = useMemo(
    () =>
      buildCompactContextOptions({
        copilotContext: input.copilotContext,
        module: input.module,
        routeKey: input.routeKey,
        scope: input.scope,
        title: input.title,
      }),
    [
      input.copilotContext,
      input.module,
      input.routeKey,
      input.scope,
      input.title,
    ]
  );

  const [selectedCompactContextId, setSelectedCompactContextId] = useState(
    compactContextOptions[0]?.id ?? "current"
  );
  const [recentCompactContextIds, setRecentCompactContextIds] = useState<
    string[]
  >([]);

  const selectedCompactContext =
    compactContextOptions.find(
      (contextOption) => contextOption.id === selectedCompactContextId
    ) ?? compactContextOptions[0];
  const currentRouteContextOption =
    compactContextOptions.find((option) => option.id === "current") ??
    compactContextOptions[0];
  const activeCopilotContext = input.threadChooserEnabled
    ? (currentRouteContextOption?.routeContext ?? input.copilotContext)
    : (selectedCompactContext?.routeContext ?? input.copilotContext);

  const recentCompactContexts = recentCompactContextIds.reduce<
    CopilotCompactContextOption[]
  >((contexts, contextId) => {
    const contextOption = compactContextOptions.find(
      (option) => option.id === contextId
    );
    if (contextOption && contextOption.id !== selectedCompactContext?.id) {
      contexts.push(contextOption);
    }
    return contexts;
  }, []);

  useEffect(() => {
    if (
      compactContextOptions.some(
        (contextOption) => contextOption.id === selectedCompactContextId
      )
    ) {
      return;
    }
    setSelectedCompactContextId(compactContextOptions[0]?.id ?? "current");
  }, [compactContextOptions, selectedCompactContextId]);

  const handleCompactContextChange = useCallback((contextId: string) => {
    setSelectedCompactContextId(contextId);
    setRecentCompactContextIds((currentIds) =>
      [
        contextId,
        ...currentIds.filter((currentId) => currentId !== contextId),
      ].slice(0, 4)
    );
  }, []);

  return {
    activeCopilotContext,
    compactContextOptions,
    handleCompactContextChange,
    recentCompactContexts,
    selectedCompactContext,
    selectedCompactContextId,
  };
}
