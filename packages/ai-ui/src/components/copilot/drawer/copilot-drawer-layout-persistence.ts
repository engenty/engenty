"use client";

import type { Dispatch, SetStateAction } from "react";
import { useEffect, useLayoutEffect, useRef } from "react";
import type { CopilotLayoutPersistenceApi } from "../session/copilot-layout-snapshot";
import { reconcileCopilotLayoutSnapshot } from "../session/copilot-layout-snapshot";

export function useCopilotDrawerLayoutPersistence(input: {
  collapseToCircle: boolean;
  copilotLayout: CopilotLayoutPersistenceApi | null;
  setCollapseToCircle: Dispatch<SetStateAction<boolean>>;
}) {
  const drawerSnapshotAppliedRef = useRef(false);
  const drawerPersistEnabledRef = useRef(false);

  useLayoutEffect(() => {
    if (
      input.copilotLayout == null ||
      !input.copilotLayout.layoutHydrated ||
      drawerSnapshotAppliedRef.current
    ) {
      return;
    }
    drawerSnapshotAppliedRef.current = true;
    const raw = input.copilotLayout.snapshot;
    const s = raw ? reconcileCopilotLayoutSnapshot(raw) : null;
    if (typeof s?.collapseToCircle === "boolean") {
      input.setCollapseToCircle(s.collapseToCircle);
    }
    drawerPersistEnabledRef.current = true;
  }, [
    input.copilotLayout,
    input.copilotLayout?.layoutHydrated,
    input.copilotLayout?.snapshot,
    input.setCollapseToCircle,
  ]);

  useEffect(() => {
    if (input.copilotLayout == null || !drawerPersistEnabledRef.current) {
      return;
    }
    const { mergeLayout } = input.copilotLayout;
    const timer = window.setTimeout(() => {
      mergeLayout({ collapseToCircle: input.collapseToCircle });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [input.collapseToCircle, input.copilotLayout]);
}
