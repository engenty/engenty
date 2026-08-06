import { createContext, type PropsWithChildren, useContext } from "react";
import type { ThreadListState } from "./types.js";

const ThreadListContext = createContext<ThreadListState | null>(null);

export function ThreadListProvider(
  props: PropsWithChildren<{ value: ThreadListState }>
) {
  return (
    <ThreadListContext.Provider value={props.value}>
      {props.children}
    </ThreadListContext.Provider>
  );
}

export function useThreadList() {
  const context = useContext(ThreadListContext);
  if (!context) {
    throw new Error("useThreadList must be used inside ThreadListProvider");
  }
  return context;
}
