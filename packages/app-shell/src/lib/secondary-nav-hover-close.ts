/** Debounced hover-preview close with a guard for portaled header menus. */

export const SECONDARY_NAV_HOVER_CLOSE_MS = 150;

export interface SecondaryNavHoverCloseController {
  cancelScheduledClose: () => void;
  scheduleClose: (onClose: () => void) => void;
  setHoverMenuOpen: (open: boolean) => void;
}

export function createSecondaryNavHoverCloseController(): SecondaryNavHoverCloseController {
  let hoverMenuOpen = false;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const cancelScheduledClose = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };

  return {
    cancelScheduledClose,
    scheduleClose(onClose) {
      if (hoverMenuOpen) {
        return;
      }
      cancelScheduledClose();
      timeout = setTimeout(() => {
        timeout = null;
        onClose();
      }, SECONDARY_NAV_HOVER_CLOSE_MS);
    },
    setHoverMenuOpen(open) {
      hoverMenuOpen = open;
      if (open) {
        cancelScheduledClose();
      }
    },
  };
}
