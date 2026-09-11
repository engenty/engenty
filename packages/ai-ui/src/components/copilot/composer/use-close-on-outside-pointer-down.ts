"use client";

import { type RefObject, useEffect } from "react";

/**
 * Close a caret-anchored composer menu when the pointer goes down anywhere
 * outside the composer and the floating menu. The menu is portaled to
 * `document.body`, so neither element contains the other — both are inside.
 */
export function useCloseOnOutsidePointerDown(input: {
  active: boolean;
  insideRefs: readonly RefObject<HTMLElement | null>[];
  onClose: () => void;
}) {
  const { active, insideRefs, onClose } = input;
  useEffect(() => {
    if (!active) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (insideRefs.some((ref) => ref.current?.contains(target))) {
        return;
      }
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [active, insideRefs, onClose]);
}
