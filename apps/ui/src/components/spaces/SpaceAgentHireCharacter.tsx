import {
  AGENT_ENGENTY_KINDS,
  type AgentEngentyKind,
} from "@engenty/ai-core/browser";
import { cn, Engenty } from "@engenty/ui-core";

export function SpaceAgentHireCharacter({
  onChange,
  value,
}: {
  onChange: (kind: AgentEngentyKind) => void;
  value: AgentEngentyKind;
}) {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="grid size-28 place-items-center">
        <Engenty
          animated
          className="[&_.e-shadow]:hidden"
          kind={value}
          size={96}
        />
      </div>
      <div className="grid w-full grid-cols-5 justify-items-center gap-1.5">
        {AGENT_ENGENTY_KINDS.map((kind) => {
          const selected = kind === value;
          return (
            <button
              aria-label={kind}
              aria-pressed={selected}
              className={cn(
                "grid size-10 place-items-center rounded-full transition-colors",
                selected ? "bg-muted ring-2 ring-primary" : "hover:bg-muted/60"
              )}
              key={kind}
              onClick={() => onChange(kind)}
              type="button"
            >
              <Engenty className="[&_.e-shadow]:hidden" kind={kind} size={28} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
