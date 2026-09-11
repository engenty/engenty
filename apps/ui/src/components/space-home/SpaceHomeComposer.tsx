/**
 * The composer on a pinned card (PLAN-space-home.md H5, P3).
 *
 * The product's chat input itself — `CopilotComposerSection` inside the
 * compact shell, the same pair the dock and every desk render: the pill, the
 * (+) menu, the mic, Enter to send. Not a text field shaped like one.
 *
 * It does not open a second chat. It hands the message to the conversation
 * through the host-message handoff the desk already uses — router state, with
 * a sessionStorage copy that survives the redirect — and follows it there, so
 * the answer arrives where the conversation lives. The dock stays what it is:
 * the Space's assistant, not this row's.
 */
import {
  agentDeskHostKey,
  agentRoomHostKey,
  CopilotCompactComposerShell,
  CopilotComposerSection,
  HOST_MESSAGE_HANDOFF_STATE,
  PromptInputProvider,
  writePendingHostMessage,
} from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SpaceApprovalModeControl } from "@/components/spaces/SpaceApprovalModeControl";
import type { Space } from "@/lib/api/spaces-client";
import { spaceConversationSearch } from "@/lib/space-conversation-open";

export function SpaceHomeComposer({
  agentId,
  agentName,
  kind,
  space,
  target,
  threadId,
}: {
  /** The desk's agent. Absent for a room, whose host key is its thread. */
  agentId?: string;
  agentName: string;
  kind: "desk" | "dm" | "room";
  space: Space;
  /** Where the conversation lives. */
  target: string;
  /** The room's or DM's thread. Null on a desk nobody has written to yet. */
  threadId: string | null;
}) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const [draft, setDraft] = useState("");
  const spaceId = space.id;
  // The conversation this composer writes into — the same key its own desk or
  // room runs under, so effort and approval read and write that lane's state.
  const hostKey = useMemo(
    () =>
      kind === "desk" && agentId
        ? agentDeskHostKey(spaceId, agentId)
        : threadId
          ? agentRoomHostKey(spaceId, threadId)
          : undefined,
    [agentId, kind, spaceId, threadId]
  );

  const submit = (text: string) => {
    const message = text.trim();
    if (!message) {
      return;
    }
    if (!hostKey) {
      return;
    }
    writePendingHostMessage(hostKey, message);
    setDraft("");
    // Where the message is sent decides how the desk must be opened. A desk is
    // a conversation only when one is bound — `engagement` for the thread this
    // agent already has, `action=ask` for the first message ever, which opens a
    // new one (agent-desk.tsx `chatIsConversation`). A room is always its own
    // conversation and needs neither.
    const search = spaceConversationSearch({ kind, threadId });
    navigate(`${target}${search}`, {
      state: { [HOST_MESSAGE_HANDOFF_STATE]: message },
    });
  };

  return (
    // The same box as the message bubble above it: both run the full width of
    // the card's text column, so the card reads as one stack of even blocks
    // rather than a wide quote over a short field. Tighter than the dock, but
    // no narrower than what it answers.
    <div className="min-w-0">
      <PromptInputProvider initialInput="">
        {/* No avatar and no usage meter: the card's header already carries this
          engenty's face, and a token meter belongs to a conversation you are
          in, not to a row you are glancing at. */}
        {/* The approval control sits UNDER the input and appears when it has
          the focus — the shell grows the card for it, the way the desk's
          composer does. A card at rest stays one line.
          
          The effort chooser is NOT here: it reads and writes the lane's own
          state through `useAgentHost`, and a card has no lane until you are in
          the conversation. Approval is the Space's, so it answers here. */}
        <CopilotCompactComposerShell
          belowCard={<SpaceApprovalModeControl space={space} />}
          chatStatus="ready"
          dense
          enableStatusFlap={false}
          showAvatar={false}
          showUsageMeter={false}
        >
          <CopilotComposerSection
            compact
            composerPlaceholder={t("spaces.home.cards.composerPlaceholder", {
              defaultValue: "Write to {{name}} …",
              name: agentName,
            })}
            dense
            draft={draft}
            setDraft={setDraft}
            showStarterPrompts={false}
            status="ready"
            submitMessage={submit}
          />
        </CopilotCompactComposerShell>
      </PromptInputProvider>
    </div>
  );
}
