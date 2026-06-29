// Job description card (ui-6 §3): rendered instructions / AGENTS.md content.
// Read-only for builtin/module/external agents; custom agents get an Edit link.

import { Button, SettingsFormSection } from "@engenty/ui-core";
import { SquarePen } from "lucide-react";
import { Link } from "react-router-dom";
import type { AiAgentEntry } from "../../lib/admin/ai-runtime-api";
import type { AiInstructionFileDocument } from "../../lib/admin/instruction-settings-api";
import { AgentInstructionSettingsPreview } from "./agent-instruction-settings-preview";
import { buildAgentEditPath } from "./agent-workspace-url-state";

interface AgentJobDescriptionCardProps {
  agent: AiAgentEntry;
  /** Custom agents only: shows an Edit link to /agents/:id/edit. */
  canEditAgent: boolean;
  documents: AiInstructionFileDocument[];
  /** External agents: hide all edit affordances. */
  isExternal: boolean;
  onOpenInstruction: (documentKey: string) => void;
  t: (key: string) => string;
}

export function AgentJobDescriptionCard({
  agent,
  canEditAgent,
  documents,
  isExternal,
  onOpenInstruction,
  t,
}: AgentJobDescriptionCardProps) {
  return (
    <SettingsFormSection
      description={t("agentDetail.jobDescriptionDescription")}
      title={t("agentDetail.jobDescriptionTitle")}
    >
      <div className="space-y-3">
        {canEditAgent ? (
          <Button asChild size="sm" variant="outline">
            <Link to={buildAgentEditPath(agent.id)}>
              <SquarePen aria-hidden className="mr-1.5 size-3.5" />
              {t("agentDetail.jobDescriptionEdit")}
            </Link>
          </Button>
        ) : null}
        {documents.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("agentDetail.jobDescriptionEmpty")}
          </p>
        ) : (
          <div className="divide-y divide-border">
            {documents.map((doc) => (
              <AgentInstructionSettingsPreview
                body={doc.body}
                documentKey={doc.document_key}
                editAriaLabel={t(
                  "agents.settingsOverview.instructionsEditTabAria"
                )}
                emptyBodyLabel={t(
                  "agents.settingsOverview.instructionsPreviewEmpty"
                )}
                heading={doc.title?.trim() || doc.filename}
                key={doc.document_key}
                onEdit={onOpenInstruction}
                readOnly={isExternal}
              />
            ))}
          </div>
        )}
      </div>
    </SettingsFormSection>
  );
}
