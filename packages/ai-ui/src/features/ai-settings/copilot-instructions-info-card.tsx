import { GENERAL_CHAT_AGENT_ID } from "@engenty/ai-core/browser";
import { Button, SettingsFormSection } from "@engenty/ui-core";
import { BookOpen, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { buildAgentInstructionsPath } from "../agents-workspace/agent-workspace-url-state";

const AGENTS_FILE = "AGENTS.md";
const SOUL_FILE = "SOUL.md";

interface CopilotInstructionsInfoCardProps {
  t: (key: string) => string;
}

export function CopilotInstructionsInfoCard({
  t,
}: CopilotInstructionsInfoCardProps) {
  const agentId = GENERAL_CHAT_AGENT_ID;
  const instructionsBase = buildAgentInstructionsPath(agentId);
  const agentsHref = buildAgentInstructionsPath(agentId, { file: AGENTS_FILE });
  const soulHref = buildAgentInstructionsPath(agentId, { file: SOUL_FILE });

  return (
    <SettingsFormSection
      description={t("copilotInstructions.description")}
      title={t("copilotInstructions.title")}
    >
      <div className="flex flex-wrap gap-2">
        <Button asChild className="h-8 gap-1.5" size="sm" variant="default">
          <Link to={instructionsBase}>
            <BookOpen className="h-3.5 w-3.5" />
            {t("copilotInstructions.openEditor")}
          </Link>
        </Button>
        <Button asChild className="h-8 gap-1.5" size="sm" variant="outline">
          <Link to={agentsHref}>
            <FileText className="h-3.5 w-3.5" />
            {AGENTS_FILE}
          </Link>
        </Button>
        <Button asChild className="h-8 gap-1.5" size="sm" variant="outline">
          <Link to={soulHref}>
            <FileText className="h-3.5 w-3.5" />
            {SOUL_FILE}
          </Link>
        </Button>
      </div>
    </SettingsFormSection>
  );
}
