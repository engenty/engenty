import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: "Engenty",
    },
    links: [{ text: "Changelog", url: "/changelog" }],
  };
}
