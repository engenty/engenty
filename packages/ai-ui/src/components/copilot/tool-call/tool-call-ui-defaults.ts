"use client";

import type { ComponentType } from "react";
import {
  DecisionArtifactToolCallCard,
  matchesDecisionArtifactOutput,
} from "./decision-artifact-tool-call-card";
import {
  FeedbackArtifactToolCallCard,
  matchesFeedbackArtifactOutput,
} from "./feedback-artifact-tool-call-card";
import { McpAppToolCallCard, readMcpAppMeta } from "./mcp-app-tool-call-card";
import {
  ObjectRenderToolCallCard,
  objectRenderToolCallMatch,
} from "../../../objects/object-render-tool-call-card";
import {
  matchesProposeUpdatesOutput,
  ProposeUpdatesToolCallCard,
} from "./propose-updates-tool-call-card";
import {
  matchesSandboxCommandToolCall,
  SandboxCommandConfirmToolCallCard,
} from "./sandbox-command-confirm-tool-call-card";
import { SubAgentTaskToolCallCard } from "./sub-agent-task-tool-call-card";
import type { ToolCallCardProps } from "./tool-call-card.types";
import { ToolCallGenericCard } from "./tool-call-generic-card";
import { ToolCallReasoningCard } from "./tool-call-reasoning-card";
import {
  buildToolCallUiMatchContext,
  registerToolCallUi,
  resolveToolCallUiCard,
} from "./tool-call-ui-registry";
import { ToolCallWebSearchCard } from "./tool-call-web-search-card";

let defaultsRegistered = false;

export function registerDefaultToolCallUiCards() {
  if (defaultsRegistered) {
    return;
  }
  defaultsRegistered = true;

  registerToolCallUi({
    id: "core_web_search",
    priority: 100,
    match: (ctx) => ctx.toolName === "web_search",
    Card: ToolCallWebSearchCard,
  });
  registerToolCallUi({
    id: "core_reasoning",
    priority: 100,
    match: (ctx) => ctx.toolName === "reasoning",
    Card: ToolCallReasoningCard,
  });
  registerToolCallUi({
    id: "core.decision-artifact",
    priority: 50,
    match: (ctx) => matchesDecisionArtifactOutput(ctx.output),
    Card: DecisionArtifactToolCallCard,
  });
  registerToolCallUi({
    id: "core.feedback-artifact",
    priority: 51,
    match: (ctx) => matchesFeedbackArtifactOutput(ctx.output),
    Card: FeedbackArtifactToolCallCard,
  });
  registerToolCallUi({
    id: "core.propose-updates",
    priority: 52,
    match: (ctx) => matchesProposeUpdatesOutput(ctx.output),
    Card: ProposeUpdatesToolCallCard,
  });
  registerToolCallUi({
    id: "core.sandbox-command-confirmation",
    priority: 54,
    match: (ctx) =>
      matchesSandboxCommandToolCall(ctx.toolName, ctx.state ?? "running"),
    Card: SandboxCommandConfirmToolCallCard,
  });
  registerToolCallUi({
    id: "core.object-render",
    priority: 55,
    match: (ctx) => objectRenderToolCallMatch(ctx),
    Card: ObjectRenderToolCallCard,
  });
  registerToolCallUi({
    id: "core.mcp-app",
    priority: 60,
    match: (ctx) => readMcpAppMeta(ctx.output) !== null,
    Card: McpAppToolCallCard,
  });
  registerToolCallUi({
    id: "core.sub-agent-task",
    priority: 80,
    match: (ctx) => ctx.toolName.startsWith("agent-"),
    Card: SubAgentTaskToolCallCard,
  });
}

export function resolveRoutedToolCallCard(
  props: ToolCallCardProps
): ComponentType<ToolCallCardProps> {
  registerDefaultToolCallUiCards();

  const ctx = buildToolCallUiMatchContext(props);
  const registered = resolveToolCallUiCard(ctx);
  if (registered) {
    return registered;
  }

  return ToolCallGenericCard;
}
