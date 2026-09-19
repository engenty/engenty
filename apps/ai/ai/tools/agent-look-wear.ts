import { createRequestDecisionArtifact } from "@engenty/ai-core";
import { getEngentyCoreBaseUrlFromEnv } from "../../src/ai/core-http-client.js";
import { createEngentyCoreFileStorageClient } from "../../src/ai/workspace/core-file-storage-client.js";
import { emitInboxNotification } from "../../src/notifications/inbox.js";
import { releaseFrontendToolSuspendSlot } from "../frontend-tools/frontend-tool-suspend-lock.js";
import {
  agentLookAvatarObjectKey,
  getAgentLookPreview,
} from "./agent-look-preview.js";
import {
  type HireHttp,
  hireSuspendLockKey,
  readDecisionChoice,
  registryJson,
  suspendHireDecision,
} from "./agent-propose-hire.js";
import { resolveEngentyToolsRunContext } from "./engenty-tools/lib/run-context.js";
import type { NativeRequestDecisionResumeData } from "./request-decision/native-request-decision.js";

export const AGENT_LOOK_TOOL_ID = "agent_look";

export interface WearLookInput {
  clear_avatar?: boolean;
  description?: string;
  engenty?: string;
  name?: string;
  preview_id?: string;
  summary: string;
}

interface CurrentConfig {
  avatarUrl?: string | null;
  name?: string;
  source?: string;
}

export async function uploadAgentLookAvatarPng(input: {
  accessToken: string;
  agentId: string;
  bytes: Uint8Array;
  coreBaseUrl: string;
  tenantId: string;
}): Promise<string> {
  const storage = createEngentyCoreFileStorageClient({
    accessToken: input.accessToken,
    coreBaseUrl: input.coreBaseUrl,
  });
  const key = agentLookAvatarObjectKey(input.tenantId, input.agentId);
  await storage.upload(key, input.bytes, {
    contentType: "image/png",
    upsert: true,
  });
  return key;
}

function wearArtifact(input: {
  agentId: string;
  description?: string;
  engenty?: string;
  name: string;
  nextName?: string;
  previewId?: string;
  summary: string;
}) {
  const bits = [
    input.summary,
    `${input.name} (${input.agentId}) keeps its current look until this is approved.`,
    ...(input.engenty ? [`Blob: ${input.engenty}`] : []),
    ...(input.previewId
      ? [`Wear the generated portrait from preview ${input.previewId}.`]
      : []),
    ...(input.nextName ? [`New name: ${input.nextName}`] : []),
    ...(input.description ? [`New description:\n\n${input.description}`] : []),
  ];
  return {
    ...createRequestDecisionArtifact({
      title: `Change how ${input.name} looks?`,
      body: bits.join("\n\n"),
      choices: [
        {
          id: "approve",
          label: "Approve",
          description: "Apply the new look from the next turn on.",
        },
        {
          id: "reject",
          label: "Reject",
          description: "Keep the current look.",
        },
      ],
    }),
    durable_inbox: true,
  };
}

export async function wearAgentLook(input: {
  ctx: {
    agent?: {
      resumeData?: unknown;
      suspend?: (payload: unknown) => Promise<void>;
    };
  };
  request: WearLookInput;
  uploadAvatar?: typeof uploadAgentLookAvatarPng;
}) {
  const uploadAvatar = input.uploadAvatar ?? uploadAgentLookAvatarPng;
  const run = resolveEngentyToolsRunContext();
  const agentId = run.agentTypeKey?.trim();
  const accessToken = run.accessToken?.trim();
  const tenantId = run.tenantId?.trim();
  const baseUrl = (run.coreBaseUrl ?? getEngentyCoreBaseUrlFromEnv())?.replace(
    /\/$/,
    ""
  );
  if (!agentId) {
    return {
      ok: false as const,
      code: "unknown_agent",
      message:
        "This run does not know which registry agent it is, so it cannot change its look.",
    };
  }
  if (!(accessToken && baseUrl)) {
    return {
      ok: false as const,
      code: "unauthorized",
      message: `${AGENT_LOOK_TOOL_ID} is unavailable in this run (no core access).`,
    };
  }
  const http: HireHttp = {
    accessToken,
    baseUrl,
    fetchFn: run.fetchImpl ?? fetch,
  };
  const lockKey = hireSuspendLockKey(run);

  const resume = input.ctx.agent?.resumeData as
    | NativeRequestDecisionResumeData
    | undefined;
  if (resume) {
    releaseFrontendToolSuspendSlot(lockKey);
    const choice = readDecisionChoice(resume);
    if (choice === "dismiss" || choice === "unknown") {
      return {
        ok: true as const,
        agent_id: agentId,
        status: "proposed" as const,
        note: "The look is still waiting for approval. Keep your current face.",
      };
    }
    const decided = await registryJson(
      http,
      `/ai/registry/agents/${encodeURIComponent(agentId)}/${choice}`,
      { body: "{}", method: "POST" }
    );
    if (!decided.ok) {
      return {
        ok: false as const,
        code: "agent_look_failed",
        message: `${AGENT_LOOK_TOOL_ID}: ${choice} HTTP ${decided.status}`,
      };
    }
    return {
      ok: true as const,
      agent_id: agentId,
      status:
        choice === "approve" ? ("active" as const) : ("rejected" as const),
      note:
        choice === "approve"
          ? "Approved. Your new look applies from the next turn."
          : "Rejected. Keep the look you have.",
    };
  }

  const current = await registryJson(
    http,
    `/ai/registry/agents/${encodeURIComponent(agentId)}`
  );
  if (!current.ok) {
    return {
      ok: false as const,
      code: "agent_look_failed",
      message: `${AGENT_LOOK_TOOL_ID}: lookup HTTP ${current.status}`,
    };
  }
  const config = (current.data.agent ?? {}) as CurrentConfig &
    Record<string, unknown>;
  if (config.source !== "database") {
    return {
      ok: false as const,
      code: "not_revisable",
      message:
        "Your face ships with the app you belong to, so it cannot be changed from here.",
    };
  }

  let avatarUrl: string | null | undefined;
  if (input.request.preview_id) {
    if (!tenantId) {
      return {
        ok: false as const,
        code: "unauthorized",
        message: `${AGENT_LOOK_TOOL_ID} is unavailable in this run (no tenant).`,
      };
    }
    const preview = getAgentLookPreview({
      agentId,
      previewId: input.request.preview_id,
      tenantId,
    });
    if (!preview) {
      return {
        ok: false as const,
        code: "preview_missing",
        message:
          "That generated preview expired or is not yours. Generate again, then wear.",
      };
    }
    avatarUrl = await uploadAvatar({
      accessToken,
      agentId,
      bytes: preview.bytes,
      coreBaseUrl: baseUrl,
      tenantId,
    });
  } else if (
    input.request.clear_avatar ||
    (input.request.engenty && !input.request.preview_id)
  ) {
    // A blob is the face again — drop a generated portrait so the silhouette shows.
    avatarUrl = null;
  }

  const proposed = await registryJson(
    http,
    `/ai/registry/agents/${encodeURIComponent(agentId)}/propose`,
    {
      body: JSON.stringify({
        ...config,
        id: agentId,
        ...(input.request.description
          ? { description: input.request.description }
          : {}),
        ...(input.request.engenty ? { engenty: input.request.engenty } : {}),
        ...(input.request.name ? { name: input.request.name } : {}),
        ...(avatarUrl === undefined ? {} : { avatarUrl }),
        proposed_by_agent: agentId,
        ...(run.space?.spaceId ? { proposed_space_id: run.space.spaceId } : {}),
      }),
      method: "POST",
    }
  );
  if (!proposed.ok) {
    return {
      ok: false as const,
      code: "agent_look_failed",
      message: `${AGENT_LOOK_TOOL_ID}: propose HTTP ${proposed.status}`,
    };
  }
  if (run.canSuspendForInteraction && input.ctx.agent?.suspend) {
    await suspendHireDecision({
      artifact: wearArtifact({
        agentId,
        name: typeof config.name === "string" ? config.name : agentId,
        summary: input.request.summary,
        ...(input.request.description
          ? { description: input.request.description }
          : {}),
        ...(input.request.engenty ? { engenty: input.request.engenty } : {}),
        ...(input.request.name ? { nextName: input.request.name } : {}),
        ...(input.request.preview_id
          ? { previewId: input.request.preview_id }
          : {}),
      }),
      lockKey,
      suspend: input.ctx.agent.suspend,
    });
    return undefined as never;
  }
  if (tenantId) {
    await emitInboxNotification({
      dedupeKey: `agent-look:${tenantId}:${agentId}`,
      kind: "agent_proposed",
      metadata: {
        agent_id: agentId,
        agent_type_key: agentId,
        ...(run.space?.spaceId ? { space_id: run.space.spaceId } : {}),
      },
      priority: "medium",
      source: "agent-registry",
      summary: `${typeof config.name === "string" ? config.name : agentId} proposed a new look: ${input.request.summary}`,
      tenantId,
    });
  }
  return {
    ok: true as const,
    agent_id: agentId,
    status: "proposed" as const,
    note: "The look is proposed and waiting for a person to approve it. Keep your current face until then.",
  };
}
