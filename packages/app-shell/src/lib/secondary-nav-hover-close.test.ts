import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSecondaryNavHoverCloseController,
  SECONDARY_NAV_HOVER_CLOSE_MS,
} from "./secondary-nav-hover-close";

describe("createSecondaryNavHoverCloseController", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces close after the default delay", () => {
    vi.useFakeTimers();
    const controller = createSecondaryNavHoverCloseController();
    const onClose = vi.fn();

    controller.scheduleClose(onClose);
    expect(onClose).not.toHaveBeenCalled();

    vi.advanceTimersByTime(SECONDARY_NAV_HOVER_CLOSE_MS - 1);
    expect(onClose).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close while a header menu guard is active", () => {
    vi.useFakeTimers();
    const controller = createSecondaryNavHoverCloseController();
    const onClose = vi.fn();

    controller.setHoverMenuOpen(true);
    controller.scheduleClose(onClose);
    vi.advanceTimersByTime(SECONDARY_NAV_HOVER_CLOSE_MS);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("cancels a pending close when the menu opens", () => {
    vi.useFakeTimers();
    const controller = createSecondaryNavHoverCloseController();
    const onClose = vi.fn();

    controller.scheduleClose(onClose);
    controller.setHoverMenuOpen(true);
    vi.advanceTimersByTime(SECONDARY_NAV_HOVER_CLOSE_MS);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("allows close again after the menu guard clears", () => {
    vi.useFakeTimers();
    const controller = createSecondaryNavHoverCloseController();
    const onClose = vi.fn();

    controller.setHoverMenuOpen(true);
    controller.setHoverMenuOpen(false);
    controller.scheduleClose(onClose);
    vi.advanceTimersByTime(SECONDARY_NAV_HOVER_CLOSE_MS);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("cancelScheduledClose clears a pending timer", () => {
    vi.useFakeTimers();
    const controller = createSecondaryNavHoverCloseController();
    const onClose = vi.fn();

    controller.scheduleClose(onClose);
    controller.cancelScheduledClose();
    vi.advanceTimersByTime(SECONDARY_NAV_HOVER_CLOSE_MS);
    expect(onClose).not.toHaveBeenCalled();
  });
});
