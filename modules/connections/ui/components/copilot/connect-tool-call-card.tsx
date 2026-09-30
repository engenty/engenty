"use client";

// In-chat connect card for the `connections_request_connect` agent op. When a
// connector is configured but the user isn't connected, it renders the shared
// ConnectButton in popup mode: the OAuth flow runs in a popup window, the
// /connections/oauth/complete landing page reports back via postMessage, and
// the card resumes the conversation with a continuation message — the user
// never leaves the chat. When already connected it shows a done state — also
// when the connection was made later through another card or Settings, read
// live from the catalog. It names who the account will belong to — the
// person, or the Space — before the click. When the connector's client
// credentials are missing, an admin adds them in place and anyone else asks
// the admins.

import type { ToolCallCardProps } from "@engenty/ai-ui";
import { useCopilotToolCallActions } from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { useQueryClient } from "@engenty/query-client";
import { cn } from "@engenty/ui-core";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import type { ConnectCompleteResult } from "../../connect-popup.js";
import { useConnectionSpacesQuery } from "../../hooks/use-connection-space.js";
import { connectionsInSpace } from "../../lib/connection-space.js";
import { connectionsKeys, useConnectionsCatalogQuery } from "../../queries.js";
import { ConnectButton } from "../connect-button.js";
import { ConnectorIcon } from "../connector-icon.js";
import { NeedsCredentialsAffordance } from "../credentials-sheet.js";

interface ConnectRequestOutput {
  accounts: string[];
  configured: boolean;
  connected: boolean;
  connector: {
    id: string;
    name: string;
    icon: string | null;
    auth_kind: "oauth2" | "api_key" | "browser";
  };
  dcr_available?: boolean;
  /**
   * The Space the connect lands in; null when the account will be the
   * person's own (`owner: "me"` — the Copilot's default).
   */
  space_id?: string | null;
}

function parse(output: unknown): ConnectRequestOutput | null {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return null;
  }
  let raw = output as Record<string, unknown>;
  // Chat runs deliver gateway op results in an `{ok, data}` envelope
  // (engenty_tool_execute); direct op calls deliver the bare payload.
  if (!raw.connector && raw.data && typeof raw.data === "object") {
    raw = raw.data as Record<string, unknown>;
  }
  const connector = raw.connector as Record<string, unknown> | undefined;
  if (
    !connector ||
    typeof connector.id !== "string" ||
    typeof connector.name !== "string" ||
    typeof raw.configured !== "boolean" ||
    typeof raw.connected !== "boolean"
  ) {
    return null;
  }
  return raw as unknown as ConnectRequestOutput;
}

export function matchesConnectRequestOutput(ctx: {
  toolName: string;
  resolvedToolName?: string;
  output?: unknown;
}): boolean {
  return (
    (ctx.toolName === "connections_request_connect" ||
      ctx.resolvedToolName === "connections_request_connect") &&
    parse(ctx.output) !== null
  );
}

export function ConnectToolCallCard(props: ToolCallCardProps) {
  const { t } = useTranslation("connections");
  const queryClient = useQueryClient();
  const { submitMessage } = useCopilotToolCallActions();
  const [flowState, setFlowState] = useState<"idle" | "connected" | "error">(
    "idle"
  );

  const data = parse(props.output);
  // The connect lands in the Space the op names, else the account is the
  // person's own.
  const spaceId = data?.space_id ?? null;
  // That owner's accounts, not the page's: the card must still read
  // "connected" after a remount (sidebar ↔ window) on another Space's page.
  const catalog = useConnectionsCatalogQuery(spaceId);
  const spacesQuery = useConnectionSpacesQuery();
  if (!data) {
    return null;
  }
  const { connector, configured } = data;
  const liveConnector = catalog.data?.connectors.find(
    (entry) => entry.id === connector.id
  );
  const liveConnected = liveConnector
    ? connectionsInSpace(liveConnector.connections, spaceId).some(
        (connection) => connection.status === "active"
      )
    : false;
  const connected =
    data.connected || flowState === "connected" || liveConnected;
  const canConnect = configured || Boolean(data.dcr_available);
  const spaceName = spaceId
    ? (spacesQuery.data?.find((space) => space.id === spaceId)?.name ??
      t("sheet.ownerSpaceUnknown"))
    : null;
  const ownerLine = spaceName
    ? t("chatCard.ownerSpace", { name: spaceName })
    : t("chatCard.ownerMe");

  const onResult = (result: ConnectCompleteResult) => {
    // Ignore results for a different connector (stale popup) — but accept a
    // missing id: older callbacks without the `connector` param still count.
    if (result.connectorId && result.connectorId !== connector.id) {
      return;
    }
    if (!result.ok) {
      setFlowState("error");
      return;
    }
    setFlowState("connected");
    void queryClient.invalidateQueries({ queryKey: connectionsKeys.all });
    // Hand control back to the agent: the connection it asked for now exists.
    submitMessage?.(t("chatCard.connectedContinue", { name: connector.name }));
  };

  return (
    <section
      className={cn(
        "my-1 flex items-center gap-3.5 rounded-xl border p-3.5 shadow-sm transition-colors",
        connected
          ? "border-emerald-600/25 bg-emerald-500/5"
          : "border-border bg-card"
      )}
    >
      <ConnectorIcon icon={connector.icon} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-foreground text-sm">
          {connector.name}
        </p>
        <p
          className={cn(
            "truncate text-xs",
            connected
              ? "text-emerald-700 dark:text-emerald-400"
              : flowState === "error"
                ? "text-destructive"
                : "text-muted-foreground"
          )}
        >
          {connected
            ? t("chatCard.connected")
            : flowState === "error"
              ? t("chatCard.connectFailed")
              : canConnect
                ? t("chatCard.connectPrompt")
                : t("chatCard.notConfigured")}
        </p>
        <p className="truncate text-muted-foreground text-xs">{ownerLine}</p>
        {flowState === "connected" ? (
          // Just connected NOW → autonomous use is at its OFF default. Chat
          // use works (the user is present); sync and scheduled runs do not,
          // and nothing else says so at this moment.
          <p className="mt-0.5 text-muted-foreground text-xs">
            {t("chatCard.connectedAutonomyHint")}
          </p>
        ) : null}
      </div>
      {connected ? (
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
          <CheckCircle2 className="size-4.5 text-emerald-600 dark:text-emerald-400" />
        </span>
      ) : canConnect ? (
        <ConnectButton
          connectorId={connector.id}
          flow="popup"
          onResult={onResult}
          size="sm"
          spaceId={spaceId}
        />
      ) : liveConnector ? (
        <NeedsCredentialsAffordance connector={liveConnector} />
      ) : null}
    </section>
  );
}
