import type { ExternalChannelProvider } from "./channels.js";

export type ExternalChannelToolApprovalAction = "approve" | "deny";

export type ExternalChannelInteraction =
  | {
      externalChannelId: string | null;
      externalMessageId: string | null;
      externalThreadId: string | null;
      externalUserId: string | null;
      externalWorkspaceId: string | null;
      kind: "tool_approval";
      provider: ExternalChannelProvider;
      rawActionId: string | null;
      toolApproval: {
        action: ExternalChannelToolApprovalAction;
        approvalId: string;
      };
    }
  | {
      kind: "provider_ping";
      provider: "discord";
    };

export type ExternalChannelInteractionResult =
  | {
      interaction: ExternalChannelInteraction;
      ok: true;
    }
  | {
      error: "channels.invalidInteractionPayload";
      ok: false;
      status: 400;
    };

export type ExternalChannelToolApprovalResult =
  | {
      reason: "tool_approval_execution_not_configured";
      status: "not_processed";
    }
  | {
      action: ExternalChannelToolApprovalAction;
      approval_id: string;
      status: "accepted";
    };

export function normalizeExternalChannelInteraction(
  provider: ExternalChannelProvider,
  payload: unknown
): ExternalChannelInteractionResult {
  if (!isRecord(payload)) {
    return invalidInteraction();
  }
  switch (provider) {
    case "slack": {
      const interaction = normalizeSlackInteraction(payload);
      return interaction ? { interaction, ok: true } : invalidInteraction();
    }
    case "discord": {
      const interaction = normalizeDiscordInteraction(payload);
      return interaction ? { interaction, ok: true } : invalidInteraction();
    }
    default:
      return assertNever(provider);
  }
}

// SEAM(approvals-channels) — Phase 3.2c wires the in-app approval gate
// (engenty_tool_execute → decision artifact → resume). Resolving a Slack/Discord
// approve/deny means mapping `interaction.toolApproval` to a resume POST on the
// owning thread with a decision payload (`choice_id: "approve" | "deny"`), exactly
// like the in-app DecisionArtifactCard. That requires the channel dispatch runtime
// to know the thread/run behind `approvalId`; until that mapping exists this stays
// a recognised-but-not-executed stub. See approvals-plan-3.2c.md.
export function handleExternalChannelToolApprovalInteraction(
  interaction: ExternalChannelInteraction
): ExternalChannelToolApprovalResult {
  if (interaction.kind !== "tool_approval") {
    return {
      reason: "tool_approval_execution_not_configured",
      status: "not_processed",
    };
  }
  return {
    reason: "tool_approval_execution_not_configured",
    status: "not_processed",
  };
}

function normalizeSlackInteraction(
  payload: Record<string, unknown>
): ExternalChannelInteraction | null {
  const actions = Array.isArray(payload.actions) ? payload.actions : [];
  const action = actions.find(isRecord);
  if (!action) {
    return null;
  }
  const decoded = decodeApprovalAction(
    readString(action.action_id),
    readString(action.value)
  );
  if (!decoded) {
    return null;
  }
  const team = payload.team;
  const user = payload.user;
  const channel = payload.channel;
  const message = payload.message;
  const container = payload.container;
  return {
    externalChannelId: isRecord(channel) ? readString(channel.id) : null,
    externalMessageId: isRecord(message) ? readString(message.ts) : null,
    externalThreadId:
      (isRecord(container) ? readString(container.thread_ts) : null) ??
      (isRecord(message) ? readString(message.thread_ts) : null) ??
      (isRecord(message) ? readString(message.ts) : null),
    externalUserId: isRecord(user) ? readString(user.id) : null,
    externalWorkspaceId: isRecord(team) ? readString(team.id) : null,
    kind: "tool_approval",
    provider: "slack",
    rawActionId: readString(action.action_id),
    toolApproval: decoded,
  };
}

function normalizeDiscordInteraction(
  payload: Record<string, unknown>
): ExternalChannelInteraction | null {
  if (payload.type === 1) {
    return { kind: "provider_ping", provider: "discord" };
  }
  const data = payload.data;
  const decoded = isRecord(data)
    ? decodeApprovalAction(readString(data.custom_id), null)
    : null;
  if (!decoded) {
    return null;
  }
  const member = payload.member;
  const memberUser = isRecord(member) ? member.user : null;
  const message = payload.message;
  return {
    externalChannelId: readString(payload.channel_id),
    externalMessageId: isRecord(message) ? readString(message.id) : null,
    externalThreadId: readString(payload.channel_id),
    externalUserId:
      (isRecord(memberUser) ? readString(memberUser.id) : null) ??
      (isRecord(payload.user) ? readString(payload.user.id) : null),
    externalWorkspaceId: readString(payload.guild_id),
    kind: "tool_approval",
    provider: "discord",
    rawActionId: isRecord(data) ? readString(data.custom_id) : null,
    toolApproval: decoded,
  };
}

function decodeApprovalAction(
  rawActionId: string | null,
  rawValue: string | null
): {
  action: ExternalChannelToolApprovalAction;
  approvalId: string;
} | null {
  const fromJson = rawValue ? readApprovalJson(rawValue) : null;
  if (fromJson) {
    return fromJson;
  }
  const actionFromId = rawActionId
    ? readApprovalAction(rawActionId.split(/[:._]/).at(-1))
    : null;
  if (actionFromId && rawValue) {
    return { action: actionFromId, approvalId: rawValue };
  }
  const valueApproval = rawValue ? readDelimitedApproval(rawValue) : null;
  if (valueApproval) {
    return valueApproval;
  }
  return rawActionId ? readDelimitedApproval(rawActionId) : null;
}

function readApprovalJson(value: string): {
  action: ExternalChannelToolApprovalAction;
  approvalId: string;
} | null {
  try {
    const payload = JSON.parse(value) as unknown;
    if (!isRecord(payload)) {
      return null;
    }
    const action = readApprovalAction(payload.action);
    const approvalId =
      readString(payload.approval_id) ?? readString(payload.approvalId);
    return action && approvalId ? { action, approvalId } : null;
  } catch {
    return null;
  }
}

function readDelimitedApproval(value: string): {
  action: ExternalChannelToolApprovalAction;
  approvalId: string;
} | null {
  const parts = value.split(/[:._]/).filter(Boolean);
  const actionIndex = parts.findIndex((part) => readApprovalAction(part));
  if (actionIndex < 0) {
    return null;
  }
  const action = readApprovalAction(parts[actionIndex]);
  const approvalId = parts[actionIndex + 1];
  return action && approvalId ? { action, approvalId } : null;
}

function readApprovalAction(
  value: unknown
): ExternalChannelToolApprovalAction | null {
  return value === "approve" || value === "deny" ? value : null;
}

function invalidInteraction(): ExternalChannelInteractionResult {
  return {
    error: "channels.invalidInteractionPayload",
    ok: false,
    status: 400,
  };
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled external channel provider: ${value}`);
}
