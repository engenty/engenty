import { createContext, useContext } from "react";

export interface KbHubCoverDialogApi {
  isPending: boolean;
  open: () => void;
}

export const KbHubCoverDialogApiContext =
  createContext<KbHubCoverDialogApi | null>(null);

export function useKbHubCoverDialogApi(): KbHubCoverDialogApi | null {
  return useContext(KbHubCoverDialogApiContext);
}
