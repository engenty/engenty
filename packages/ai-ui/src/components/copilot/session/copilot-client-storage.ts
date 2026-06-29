const COPILOT_PERSISTED_SESSION_PREFIX = "engenty.copilot.session.v1:";
const COPILOT_SELECTED_AGENT_PREFIX = "copilot.selectedAgent:";
const COPILOT_AGENT_SESSION_PREFIX = "copilot.agentSession:";

function isBrowserStorageAvailable(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function removeLocalStorageKeysByPrefix(prefix: string): void {
  if (!isBrowserStorageAvailable()) {
    return;
  }
  const keys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(prefix)) {
      keys.push(key);
    }
  }
  for (const key of keys) {
    window.localStorage.removeItem(key);
  }
}

/** Clears persisted copilot transcripts and lane store bindings from localStorage. */
export function clearCopilotPersistedClientStorage(): void {
  removeLocalStorageKeysByPrefix(COPILOT_PERSISTED_SESSION_PREFIX);
  removeLocalStorageKeysByPrefix(COPILOT_SELECTED_AGENT_PREFIX);
  removeLocalStorageKeysByPrefix(COPILOT_AGENT_SESSION_PREFIX);
}
