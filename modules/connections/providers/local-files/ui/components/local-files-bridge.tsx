import { useEffect, useState } from "react";
import {
  acquireLocalFilesBridge,
  subscribeLocalFilesBridgeReady,
} from "../lib/bridge-session.js";

/**
 * Claim/heartbeat loop while a files surface is mounted. No-ops unless this
 * browser actually holds a granted folder — Work/chat must not poll.
 */
export function useLocalFilesBridge(enabled = true): { ready: boolean } {
  const [ready, setReady] = useState(!enabled);

  useEffect(() => {
    if (!enabled) {
      setReady(true);
      return;
    }
    const release = acquireLocalFilesBridge();
    const unsubscribe = subscribeLocalFilesBridgeReady(setReady);
    return () => {
      unsubscribe();
      release();
    };
  }, [enabled]);

  return { ready };
}
