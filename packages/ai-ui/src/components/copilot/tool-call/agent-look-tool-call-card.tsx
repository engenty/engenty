"use client";

import {
  AGENT_ENGENTY_LOOKS,
  type AgentEngentyKind,
} from "@engenty/ai-core/browser";
import { Engenty } from "@engenty/ui-core";
import type { ToolCallCardProps } from "./tool-call-card.types";
import { ToolCallCardBase } from "./tool-call-card-base";
import { asRecord } from "./tool-call-card-utils";
import { ToolCallGenericCard } from "./tool-call-generic-card";

function readLooks(output: unknown): Array<{
  color: string;
  kind: AgentEngentyKind;
  silhouette: string;
}> {
  const record = asRecord(output);
  const looks = record?.looks;
  if (!Array.isArray(looks)) {
    return [];
  }
  return looks.flatMap((entry) => {
    const row = asRecord(entry);
    const kind = row?.kind;
    if (
      typeof kind !== "string" ||
      !AGENT_ENGENTY_LOOKS.some((look) => look.kind === kind)
    ) {
      return [];
    }
    return [
      {
        color: typeof row?.color === "string" ? row.color : "",
        kind: kind as AgentEngentyKind,
        silhouette: typeof row?.silhouette === "string" ? row.silhouette : kind,
      },
    ];
  });
}

function readPreview(output: unknown): {
  dataUrl: string;
  previewId: string | null;
} | null {
  const record = asRecord(output);
  const direct = typeof record?.data_url === "string" ? record.data_url : null;
  const meta = asRecord(asRecord(record?._meta)?.engenty)?.avatar_preview;
  const nested = asRecord(meta);
  const dataUrl =
    direct ?? (typeof nested?.data_url === "string" ? nested.data_url : null);
  if (!dataUrl?.startsWith("data:image/")) {
    return null;
  }
  const previewId =
    (typeof record?.preview_id === "string" && record.preview_id) ||
    (typeof nested?.preview_id === "string" && nested.preview_id) ||
    null;
  return { dataUrl, previewId };
}

export function matchesAgentLookOutput(ctx: {
  output?: unknown;
  toolName: string;
}): boolean {
  return ctx.toolName === "agent_look";
}

export function AgentLookToolCallCard(props: ToolCallCardProps) {
  const preview = readPreview(props.output);
  if (preview) {
    return (
      <section className="my-1 w-full max-w-sm rounded-xl border border-border bg-card p-3.5 shadow-sm">
        <p className="font-semibold text-foreground text-sm">
          Portrait preview
        </p>
        <img
          alt="Generated Engenty portrait"
          className="mt-2 aspect-square w-full rounded-lg bg-muted object-contain"
          height={512}
          src={preview.dataUrl}
          width={512}
        />
        {preview.previewId ? (
          <p className="mt-2 text-muted-foreground text-xs">
            Say if you like it — then it can be worn.
          </p>
        ) : null}
      </section>
    );
  }

  const looks = readLooks(props.output);
  if (looks.length > 0) {
    return (
      <section className="my-1 w-full rounded-xl border border-border bg-card p-3.5 shadow-sm">
        <p className="font-semibold text-foreground text-sm">Engenty looks</p>
        <ul className="mt-2 grid grid-cols-5 gap-2">
          {looks.map((look) => (
            <li
              className="flex flex-col items-center gap-1 text-center"
              key={look.kind}
            >
              <Engenty kind={look.kind} size={36} />
              <span className="text-[10px] text-muted-foreground leading-tight">
                {look.kind}
                <br />
                {look.color}
              </span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const record = asRecord(props.output);
  if (typeof record?.engenty === "string") {
    return (
      <ToolCallCardBase
        {...props}
        details={[
          `Blob: ${record.engenty}`,
          typeof record.name === "string" ? `Name: ${record.name}` : "",
          typeof record.description === "string" ? record.description : "",
        ].filter(Boolean)}
        headline={
          typeof record.name === "string"
            ? `Suggested: ${record.name}`
            : "Suggested look"
        }
      />
    );
  }

  return <ToolCallGenericCard {...props} />;
}
