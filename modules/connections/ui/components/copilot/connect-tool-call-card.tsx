"use client";

// In-chat connect card for the `connections_request_connect` agent op. When a
// connector is configured but the user isn't connected, it renders the shared
// ConnectButton (the OAuth redirect returns to the app with `?connected=1`).
// When already connected it shows a done state; when the connector's client
// credentials are missing anywhere, it points the user at Setup.

import type { ToolCallCardProps } from "@engenty/ai-ui";
import { ConnectButton } from "../connect-button.js";

const CONNECTIONS_SETTINGS_PATH = "/settings/connections";

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
}

function parse(output: unknown): ConnectRequestOutput | null {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return null;
  }
  const raw = output as Record<string, unknown>;
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
  return output as ConnectRequestOutput;
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
  const data = parse(props.output);
  if (!data) {
    return null;
  }
  const { connector, configured, connected } = data;

  return (
    <section className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground/90 text-sm">
          {connector.name}
        </p>
        <p className="text-muted-foreground text-xs">
          {connected
            ? "Connected"
            : configured
              ? "Connect your account to continue"
              : "Not available yet — an admin must add this connector's credentials in Setup → Platform settings"}
        </p>
      </div>
      {connected || !configured ? null : (
        <ConnectButton
          connectorId={connector.id}
          redirectTo={CONNECTIONS_SETTINGS_PATH}
          size="sm"
        />
      )}
    </section>
  );
}
