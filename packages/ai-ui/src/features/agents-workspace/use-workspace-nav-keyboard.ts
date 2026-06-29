import type { KeyboardEvent, RefObject } from "react";
import { useCallback } from "react";

function isFocusableButton(el: HTMLButtonElement): boolean {
  if (el.disabled) {
    return false;
  }
  if (typeof el.checkVisibility === "function") {
    return el.checkVisibility({ checkOpacity: false });
  }
  return el.offsetWidth > 0 || el.offsetHeight > 0;
}

function listFocusableButtons(root: HTMLElement): HTMLButtonElement[] {
  return Array.from(root.querySelectorAll<HTMLButtonElement>("button")).filter(
    (btn) => isFocusableButton(btn)
  );
}

function findSkillNavButton(
  root: HTMLElement,
  skillName: string
): HTMLButtonElement | null {
  return (
    Array.from(
      root.querySelectorAll<HTMLButtonElement>("[data-engenty-skill]")
    ).find((btn) => btn.getAttribute("data-engenty-skill") === skillName) ??
    null
  );
}

export interface WorkspaceNavSkillArrowOptions {
  onSelectSkillName: (skillName: string) => void;
  orderedSkillNames: readonly string[];
  selectedSkillId: string;
  skillsContainerRef: RefObject<HTMLElement | null>;
}

/**
 * ArrowUp / ArrowDown: inside the skills list, move to prev/next skill (navigates URL).
 * Elsewhere in the rail, roving focus between visible sidebar buttons.
 */
export function useWorkspaceNavKeyboard(
  navRootRef: RefObject<HTMLElement | null>,
  skillArrows?: WorkspaceNavSkillArrowOptions | null
) {
  return useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
        return;
      }
      const root = navRootRef.current;
      if (!root?.contains(event.target as Node)) {
        return;
      }

      const skillsEl = skillArrows?.skillsContainerRef.current;
      const target = event.target as Node | null;
      const inSkills =
        Boolean(skillArrows) &&
        skillsEl &&
        target &&
        skillsEl.contains(target) &&
        skillArrows.orderedSkillNames.length > 0;

      if (inSkills && skillArrows) {
        const { onSelectSkillName, orderedSkillNames, selectedSkillId } =
          skillArrows;

        let idx = -1;
        if (document.activeElement instanceof HTMLElement) {
          const fromData =
            document.activeElement.getAttribute("data-engenty-skill");
          if (fromData !== null && orderedSkillNames.includes(fromData)) {
            idx = orderedSkillNames.indexOf(fromData);
          }
        }
        if (
          idx < 0 &&
          selectedSkillId &&
          orderedSkillNames.includes(selectedSkillId)
        ) {
          idx = orderedSkillNames.indexOf(selectedSkillId);
        }

        const delta = event.key === "ArrowDown" ? 1 : -1;
        let nextIdx =
          idx < 0
            ? delta > 0
              ? 0
              : orderedSkillNames.length - 1
            : idx + delta;

        nextIdx = Math.max(0, Math.min(orderedSkillNames.length - 1, nextIdx));

        if (idx >= 0 && nextIdx === idx) {
          event.preventDefault();
          return;
        }

        event.preventDefault();
        const nextName = orderedSkillNames[nextIdx];
        if (nextName === undefined) {
          return;
        }
        onSelectSkillName(nextName);

        window.setTimeout(() => {
          const btn = findSkillNavButton(root, nextName);
          btn?.focus();
          btn?.scrollIntoView({ block: "nearest", inline: "nearest" });
        }, 0);
        return;
      }

      const buttons = listFocusableButtons(root);
      if (buttons.length === 0) {
        return;
      }

      const active = document.activeElement;
      const idx =
        active instanceof HTMLButtonElement ? buttons.indexOf(active) : -1;

      if (idx === -1) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          buttons[0]?.focus();
          buttons[0]?.scrollIntoView({ block: "nearest", inline: "nearest" });
        } else {
          event.preventDefault();
          const last = buttons.at(-1);
          last?.focus();
          last?.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
        return;
      }

      const delta = event.key === "ArrowDown" ? 1 : -1;
      const next = idx + delta;
      if (next < 0 || next >= buttons.length) {
        return;
      }

      event.preventDefault();
      const el = buttons[next];
      el?.focus();
      el?.scrollIntoView({ block: "nearest", inline: "nearest" });
    },
    [navRootRef, skillArrows]
  );
}
