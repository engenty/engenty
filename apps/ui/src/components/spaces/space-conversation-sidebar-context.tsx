/**
 * What every row and heading of the conversation list can do, handed down
 * once instead of through six layers of props: file, pin, hide, open a DM,
 * open a room dialog, ask for a name. The root (`SpaceConversationSections`)
 * provides it; rows and section headings read it.
 */
import type { AgentDeskSwitchAgent } from "@engenty/ai-ui";
import type { ConversationNavItem } from "@engenty/user-settings";
import { createContext, useContext } from "react";

export interface SpaceNameDialogRequest {
  initial?: string;
  label: string;
  onSubmit: (name: string) => void;
  submitLabel: string;
  title: string;
}

export interface SpaceConversationSidebarActions {
  /** Hired-agent removal, room management for rooms one does not own. */
  canManage: boolean;
  createSection: (name: string) => string;
  currentUserId: string | null;
  deleteSection: (sectionId: string) => void;
  hide: (item: ConversationNavItem) => void;
  moveTo: (item: ConversationNavItem, sectionId: string | null) => void;
  /** Opens (or creates) the viewer's DM with the agent and navigates to it. */
  openDm: (agentId: string) => void;
  openNameDialog: (request: SpaceNameDialogRequest) => void;
  /** The new-room dialog, optionally with a host already picked. */
  openNewRoom: (host?: AgentDeskSwitchAgent) => void;
  personalSections: readonly { id: string; name: string }[];
  pin: (item: ConversationNavItem) => void;
  renameSection: (sectionId: string, name: string) => void;
  spaceId: string;
  spaceKey: string;
  unpin: (item: ConversationNavItem) => void;
}

const SpaceConversationSidebarContext =
  createContext<SpaceConversationSidebarActions | null>(null);

export const SpaceConversationSidebarProvider =
  SpaceConversationSidebarContext.Provider;

export function useSpaceConversationSidebarActions(): SpaceConversationSidebarActions {
  const value = useContext(SpaceConversationSidebarContext);
  if (!value) {
    throw new Error(
      "useSpaceConversationSidebarActions outside SpaceConversationSections"
    );
  }
  return value;
}
