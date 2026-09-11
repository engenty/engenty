import type {
  AgentDeskEngagement,
  AgentDeskLane,
} from "@engenty/ai-core/browser";
import { AgentDeskEngagementRow } from "./agent-desk-engagement-row.js";

const SECTIONS: Array<{ label: string; lanes: AgentDeskLane[] }> = [
  { label: "Needs attention", lanes: ["waiting"] },
  { label: "Active work", lanes: ["active"] },
  { label: "Conversations", lanes: ["conversation"] },
  { label: "Assigned work", lanes: ["assigned"] },
  { label: "Completed", lanes: ["completed"] },
];

export function AgentDeskEngagementList({
  defaultEngagementId,
  engagements,
}: {
  defaultEngagementId?: string;
  engagements: AgentDeskEngagement[];
}) {
  return (
    <div className="flex flex-col gap-6">
      {SECTIONS.map((section) => {
        const items = engagements.filter((engagement) =>
          section.lanes.includes(engagement.lane)
        );
        return items.length > 0 ? (
          <section
            aria-labelledby={`agent-desk-${section.lanes[0]}`}
            key={section.label}
          >
            <h2
              className="mb-2 font-semibold text-muted-foreground/70 text-xxs uppercase tracking-wider"
              id={`agent-desk-${section.lanes[0]}`}
            >
              {section.label}
            </h2>
            <div className="ui-card-elevated divide-y divide-border-soft overflow-hidden">
              {items.map((engagement) => (
                <AgentDeskEngagementRow
                  engagement={engagement}
                  isDefault={engagement.id === defaultEngagementId}
                  key={engagement.id}
                />
              ))}
            </div>
          </section>
        ) : null;
      })}
    </div>
  );
}
