/**
 * The composer on a pinned card (PLAN-space-home.md H5, P3).
 *
 * The product's chat input itself — `CopilotComposerSection` inside the
 * compact shell, the same pair the dock and every desk render: the pill, the
 * (+) menu, the mic, Enter to send. Not a text field shaped like one.
 *
 * It does not open a second chat. The message goes to the conversation from
 * HERE — the thread is opened if the desk has none, the run starts, and the
 * words sit in a bubble on the card the moment Enter is pressed — and only
 * then does the page follow it to the desk, which hydrates the turn and
 * attaches to the run already answering. The old handoff (park the text,
 * navigate, let the desk send once it is ready) stays as the fallback for a
 * send that fails before the server accepts it. The dock stays what it is:
 * the Space's assistant, not this row's.
 */
import {
  agentDeskHostKey,
  agentRoomHostKey,
  CopilotCompactComposerShell,
  CopilotComposerSection,
  conversationEngagement,
  HOST_MESSAGE_HANDOFF_STATE,
  PromptInputProvider,
  sendDeskMessageInPlace,
  spaceHomeQueryKey,
  useEngentyAIContext,
  writePendingHostMessage,
} from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { useQueryClient } from "@engenty/query-client";
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
  const queryClient = useQueryClient();
  const { serviceBaseUrl } = useEngentyAIContext();
  const [draft, setDraft] = useState("");
  // The words, shown on the card the instant they are sent — the same bubble
  // the card draws for the last message, so the send reads as one already.
  const [sent, setSent] = useState<string | null>(null);
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

  const follow = (search: string, state?: Record<string, string>) => {
    navigate(`${target}${search}`, state ? { state } : undefined);
  };

  const submit = async (text: string) => {
    const message = text.trim();
    if (!(message && hostKey)) {
      return;
    }
    setDraft("");
    setSent(message);
    try {
      const result = await sendDeskMessageInPlace({
        agentId: agentId ?? null,
        hostKey,
        routeContext: {
          moduleId: "agent-desk",
          pathname: target,
          routeKey: "agent-desk",
          scope: { space_id: spaceId },
        },
        serviceBaseUrl,
        text: message,
        threadId,
        title: kind === "desk" ? agentName : null,
      });
      // The card's preview and the sidebar's order read the thread; both
      // pick the new turn up on their next fetch.
      void queryClient.invalidateQueries({
        queryKey: spaceHomeQueryKey(spaceId, null).slice(0, 3),
      });
      // A desk opens the conversation it was written into — the one just
      // created when it had none. A room or a DM is always its own thread.
      follow(
        kind === "desk"
          ? `?engagement=${encodeURIComponent(conversationEngagement(result.threadId))}`
          : ""
      );
    } catch {
      // The server never took the message: park it and let the desk send it
      // the way it always could.
      writePendingHostMessage(hostKey, message);
      follow(spaceConversationSearch({ kind, threadId }), {
        [HOST_MESSAGE_HANDOFF_STATE]: message,
      });
    }
  };

  return (
    // The same box as the message bubble above it: both run the full width of
    // the card's text column, so the card reads as one stack of even blocks
    // rather than a wide quote over a short field. Tighter than the dock, but
    // no narrower than what it answers.
    <div className="flex min-w-0 flex-col gap-3">
      {sent ? (
        <div
          className="ml-auto min-w-0 max-w-[min(100%,28rem)] rounded-2xl bg-primary/10 px-3 py-2"
          data-testid="space-home-composer-sent"
        >
          <p className="line-clamp-2 text-[13px] text-foreground leading-relaxed">
            {sent}
          </p>
        </div>
      ) : null}
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
          chatStatus={sent ? "submitted" : "ready"}
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
            status={sent ? "submitted" : "ready"}
            submitMessage={(text) => {
              void submit(text);
            }}
          />
        </CopilotCompactComposerShell>
      </PromptInputProvider>
    </div>
  );
}
