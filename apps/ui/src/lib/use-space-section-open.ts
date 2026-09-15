/**
 * Persist whether a Work-tab sidebar section (a conversation section,
 * Modules, People) is open, per space. Default is open so a first visit still shows the lists.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export const SPACE_SECTION_OPEN_KEYS = {
  artifacts: "engenty.space.artifacts-section.open",
  data: "engenty.space.data-section.open",
  files: "engenty.space.files-section.open",
  homeExtensions: "engenty.space.home.extensions-section.open",
  homeFiles: "engenty.space.home.files-section.open",
  homeModules: "engenty.space.home.modules-section.open",
  members: "engenty.space.members-section.open",
  modules: "engenty.space.modules-section.open",
} as const;

export function readSpaceSectionOpen(
  storageKey: string,
  spaceKey: string,
  defaultOpen = true
): boolean {
  if (typeof window === "undefined") {
    return defaultOpen;
  }
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return defaultOpen;
    }
    const map = JSON.parse(raw) as Record<string, unknown>;
    if (!(spaceKey in map)) {
      return defaultOpen;
    }
    return map[spaceKey] !== false;
  } catch {
    return defaultOpen;
  }
}

export function writeSpaceSectionOpen(
  storageKey: string,
  spaceKey: string,
  open: boolean
): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const raw = window.localStorage.getItem(storageKey);
    const map = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    map[spaceKey] = open;
    window.localStorage.setItem(storageKey, JSON.stringify(map));
  } catch {
    // quota exceeded or private mode
  }
}

export function useSpaceSectionOpen(
  storageKey: string,
  spaceKey: string,
  defaultOpen = true
) {
  const [open, setOpenState] = useState(() =>
    readSpaceSectionOpen(storageKey, spaceKey, defaultOpen)
  );
  const defaultOpenRef = useRef(defaultOpen);
  defaultOpenRef.current = defaultOpen;

  useEffect(() => {
    setOpenState(
      readSpaceSectionOpen(storageKey, spaceKey, defaultOpenRef.current)
    );
  }, [spaceKey, storageKey]);

  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next);
      writeSpaceSectionOpen(storageKey, spaceKey, next);
    },
    [spaceKey, storageKey]
  );

  return [open, setOpen] as const;
}
