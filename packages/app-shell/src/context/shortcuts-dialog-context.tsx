import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";

export interface ShortcutsDialogContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const ShortcutsDialogContext =
  createContext<ShortcutsDialogContextValue | null>(null);

export function ShortcutsDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ open, setOpen }), [open]);
  return (
    <ShortcutsDialogContext.Provider value={value}>
      {children}
    </ShortcutsDialogContext.Provider>
  );
}

export function useShortcutsDialog(): ShortcutsDialogContextValue {
  const value = useContext(ShortcutsDialogContext);
  if (!value) {
    throw new Error(
      "useShortcutsDialog must be used within ShortcutsDialogProvider"
    );
  }
  return value;
}
