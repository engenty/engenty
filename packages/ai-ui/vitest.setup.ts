import { createElement } from "react";
import { vi } from "vitest";

// ui-icons pulls motion; avoid duplicate React + animation hooks in unit tests.
vi.mock("@engenty/ui-icons", () => ({
  AnimatedCheckIcon: () => null,
  AnimatedCopyIcon: () => null,
  AnimatedDownloadIcon: () => null,
  AnimatedLoaderIcon: ({ className }: { className?: string }) =>
    createElement("svg", {
      "aria-hidden": true,
      className,
      "data-testid": "animated-loader-icon",
    }),
  AnimatedRefreshIcon: () => null,
  AnimatedSendIcon: () => null,
}));
