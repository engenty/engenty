// Ready – what the tenant setup made, and the way in. The person is already
// signed in, so the buttons only navigate.

import { Button } from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import type { SetupCopy } from "../../lib/setup-wizard-i18n";
import type { SetupSpace } from "../../lib/tenant-setup-api";
import { type MarkStatus, StatusMark } from "./setup-bits";
import type { SetupStory } from "./setup-scene";

function Row({ status, text }: { status: MarkStatus; text: string }) {
  return (
    <li className="flex items-center gap-2.5 py-2.5">
      <StatusMark status={status} />
      <span className="min-w-0 flex-1 truncate text-[14px] text-ink">
        {text}
      </span>
    </li>
  );
}

export function ReadyStep({
  apps,
  copilot,
  copy,
  engenty,
  onOpen,
  space,
}: {
  /** Names of the apps the space got. */
  apps: readonly string[];
  copilot: SetupStory["copilot"];
  copy: SetupCopy["ready"];
  /** The hired engenty's name; null when the step was skipped. */
  engenty: string | null;
  onOpen: (path: string) => void;
  space: SetupSpace;
}) {
  const spacePath = `/s/${space.key}`;
  return (
    <div className="flex flex-col gap-6">
      <ul className="divide-y divide-ink/6 rounded-[10px] bg-card px-4 ring-1 ring-ink/8">
        <Row status="ok" text={copy.spaceRow(space.name, spacePath)} />
        <Row
          status={engenty ? "ok" : "warn"}
          text={engenty ? copy.engentyRow(engenty) : copy.engentySkipped}
        />
        <Row
          status={apps.length > 0 ? "ok" : "warn"}
          text={copy.appsRow(apps)}
        />
        <li className="flex items-center gap-2.5 py-2.5">
          {copilot === "starting" ? (
            <AnimatedLoaderIcon play="always" size="sm" />
          ) : (
            <StatusMark status={copilot === "ready" ? "ok" : "warn"} />
          )}
          <span className="text-[14px] text-ink">
            {copilot === "starting"
              ? copy.copilotStarting
              : copilot === "ready"
                ? copy.copilotReady
                : copy.copilotLater}
          </span>
        </li>
      </ul>
      <Button
        className="h-11 w-full text-[15px]"
        onClick={() => onOpen(spacePath)}
        type="button"
      >
        {copy.openSpace}
      </Button>
    </div>
  );
}
