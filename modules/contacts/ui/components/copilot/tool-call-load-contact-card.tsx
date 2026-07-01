"use client";

import {
  asRecord,
  readStringField,
  ToolCallCardBase,
  type ToolCallCardProps,
  toHumanValue,
} from "@engenty/ai-ui";
import { cn } from "@engenty/ui-core";
import { DatabaseZap } from "lucide-react";

export function ToolCallLoadContactCard(props: ToolCallCardProps) {
  const { toolName: _toolName, displayLabel, ...baseProps } = props;
  const inputRecord = asRecord(props.input);
  const outputRecord = asRecord(props.output);

  const entityName =
    readStringField(outputRecord, ["name", "title", "entity_name"]) ??
    readStringField(inputRecord, ["name", "title"]);

  const entityType =
    readStringField(outputRecord, ["type", "entity_type"]) ??
    readStringField(inputRecord, ["type", "entity_type"]);

  const entityId =
    readStringField(inputRecord, ["recordId", "record_id", "id", "entityId"]) ??
    readStringField(outputRecord, ["recordId", "record_id", "id", "entityId"]);

  const roles = toHumanValue(outputRecord?.roles);

  const details = [
    entityId ? `Record: ${entityId}` : null,
    entityName ? `Name: ${entityName}` : null,
    entityType ? `Type: ${entityType}` : null,
    roles ? `Roles: ${roles}` : null,
  ].filter((row): row is string => Boolean(row));

  return (
    <ToolCallCardBase
      {...baseProps}
      details={details}
      headline={
        displayLabel ?? (entityName ? `Loaded ${entityName}` : "Loaded record")
      }
      icon={
        <DatabaseZap
          className={cn(
            "h-4 w-4 shrink-0",
            props.state === "error" ? "text-destructive" : "text-sky-500"
          )}
        />
      }
      tone="entity"
    />
  );
}
