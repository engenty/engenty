/** Selector for overlay elements that should not trigger blur-close (dialogs, menus, popovers). */
const OVERLAY_SELECTOR =
  '[role="dialog"], [role="menu"], [data-radix-popper-content-wrapper]';

/**
 * Creates an onBlur handler that closes editing only when focus leaves to a non-overlay element.
 * Prevents closing when focus moves to a dialog, menu, or Radix popover (e.g. link dialog).
 */
export function createBlurCloseHandler(onClose: () => void) {
  return (e: React.FocusEvent) => {
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (relatedTarget?.closest(OVERLAY_SELECTOR)) {
      return;
    }
    setTimeout(() => {
      const active = document.activeElement as HTMLElement | null;
      if (!active?.closest(OVERLAY_SELECTOR)) {
        onClose();
      }
    }, 100);
  };
}
