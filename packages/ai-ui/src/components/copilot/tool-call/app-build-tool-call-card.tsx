"use client";

// app_build's transcript card: the normal generic summary row, with the built
// App rendered inline underneath — the deliverable shows up in the
// conversation itself (the artifact pane stays the full-size home).

import {
  InlineAppArtifact,
  readAppBuildArtifactId,
} from "../../../artifacts/inline-app-artifact.js";
import type { ToolCallCardProps } from "./tool-call-card.types";
import { ToolCallGenericCard } from "./tool-call-generic-card";

export function matchesAppBuildOutput(output: unknown): boolean {
  return readAppBuildArtifactId(output) !== null;
}

export function AppBuildToolCallCard(props: ToolCallCardProps) {
  const artifactId = readAppBuildArtifactId(props.output);
  return (
    <div className="w-full">
      <ToolCallGenericCard {...props} />
      {artifactId ? <InlineAppArtifact artifactId={artifactId} /> : null}
    </div>
  );
}
