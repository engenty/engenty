import { useCallback, useState } from "react";

const STORAGE_KEY = "engenty.team-chat.recent-tabs";
const MAX_TABS = 5;

function readTabs(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

function writeTabs(tabs: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
  } catch {
    // Storage full/blocked — tabs just don't persist.
  }
}

/**
 * The dashboard's conversation tabs: the last {@link MAX_TABS} opened
 * conversations (most recent first), manually closable. Persisted per browser
 * in localStorage; recorded by the page whenever a conversation is opened.
 */
export function useRecentConversationTabs() {
  const [tabs, setTabs] = useState<string[]>(readTabs);

  const record = useCallback((conversationId: string) => {
    setTabs((previous) => {
      if (previous[0] === conversationId) {
        return previous;
      }
      const next = [
        conversationId,
        ...previous.filter((id) => id !== conversationId),
      ].slice(0, MAX_TABS);
      writeTabs(next);
      return next;
    });
  }, []);

  const close = useCallback((conversationId: string) => {
    setTabs((previous) => {
      const next = previous.filter((id) => id !== conversationId);
      writeTabs(next);
      return next;
    });
  }, []);

  return { close, record, tabs };
}
