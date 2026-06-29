"use client";

import { cn } from "@engenty/ui-core";
import { useMemo } from "react";
import type { ToolCallCardProps } from "./tool-call-card.types";
import { ToolCallCardBase } from "./tool-call-card-base";

interface McpAppMeta {
  html?: string;
  resource_uri?: string;
  server_id: string;
  server_label: string;
  server_url: string;
  tool_name: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function readMcpAppMeta(output: unknown): McpAppMeta | null {
  if (!isRecord(output)) {
    return null;
  }
  const meta = output._meta;
  if (!isRecord(meta)) {
    return null;
  }
  const engenty = meta.engenty;
  if (!isRecord(engenty)) {
    return null;
  }
  const mcpApp = engenty.mcp_app;
  if (!isRecord(mcpApp)) {
    return null;
  }
  const serverId = mcpApp.server_id;
  const serverLabel = mcpApp.server_label;
  const serverUrl = mcpApp.server_url;
  const toolName = mcpApp.tool_name;
  if (
    typeof serverId !== "string" ||
    typeof serverLabel !== "string" ||
    typeof serverUrl !== "string" ||
    typeof toolName !== "string"
  ) {
    return null;
  }
  return {
    server_id: serverId,
    server_label: serverLabel,
    server_url: serverUrl,
    tool_name: toolName,
    html: typeof mcpApp.html === "string" ? mcpApp.html : undefined,
    resource_uri:
      typeof mcpApp.resource_uri === "string" ? mcpApp.resource_uri : undefined,
  };
}

export function McpAppToolCallCard(props: ToolCallCardProps) {
  const { toolName: _toolName, ...cardProps } = props;
  const meta = readMcpAppMeta(props.output);
  const details = useMemo(() => {
    if (!meta) {
      return ["MCP App metadata was not available."];
    }
    return [
      `Server: ${meta.server_label}`,
      `Tool: ${meta.tool_name}`,
      ...(meta.resource_uri ? [`Resource: ${meta.resource_uri}`] : []),
    ];
  }, [meta]);

  if (!meta?.html) {
    return (
      <ToolCallCardBase
        {...cardProps}
        details={details}
        headline={props.displayLabel ?? "Interactive widget"}
        metadata={props.metadata ?? meta?.server_label}
      />
    );
  }

  if ((props.state ?? "completed") === "completed") {
    return (
      <div
        className={cn(
          "my-1 w-full overflow-hidden rounded-lg bg-background shadow-sm ring-1 ring-border/60",
          props.className
        )}
      >
        <iframe
          className="h-80 w-full bg-background"
          sandbox="allow-forms allow-popups allow-scripts"
          srcDoc={meta.html}
          title={`${meta.server_label} interactive widget`}
        />
      </div>
    );
  }

  return (
    <ToolCallCardBase
      {...cardProps}
      defaultOpen={props.defaultOpen ?? true}
      details={details}
      headline={props.displayLabel ?? "Loading interactive widget"}
      metadata={props.metadata ?? meta.server_label}
    >
      <div className="overflow-hidden rounded-lg bg-background ring-1 ring-border/60">
        <iframe
          className="h-80 w-full bg-background"
          sandbox="allow-forms allow-popups allow-scripts"
          srcDoc={meta.html}
          title={`${meta.server_label} interactive widget`}
        />
      </div>
    </ToolCallCardBase>
  );
}
