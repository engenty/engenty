import { createContext, type PropsWithChildren, useContext } from "react";
import type { SessionListState } from "./types.js";

const SessionListContext = createContext<SessionListState | null>(null);

export function SessionListProvider(
  props: PropsWithChildren<{ value: SessionListState }>
) {
  return (
    <SessionListContext.Provider value={props.value}>
      {props.children}
    </SessionListContext.Provider>
  );
}

export function useSessionList() {
  const context = useContext(SessionListContext);
  if (!context) {
    throw new Error("useSessionList must be used inside SessionListProvider");
  }
  return context;
}
