import { CopilotEffortControl } from "@engenty/engenty-copilot/ui/effort-control";
import type { Space } from "@/lib/api/spaces-client";
import { SpaceApprovalModeControl } from "./SpaceApprovalModeControl";

/**
 * The two composer pills under a Space desk input: effort (how hard to
 * think) and approval (how much to ask a human). Kept as two controls
 * because they are independent axes — mixing them into one menu hides both
 * answers.
 */
export function SpaceComposerControls({
  hostKey,
  space,
}: {
  hostKey?: string;
  space: Space;
}) {
  return (
    <>
      <CopilotEffortControl hostKey={hostKey} />
      <SpaceApprovalModeControl space={space} />
    </>
  );
}
