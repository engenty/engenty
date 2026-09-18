import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { DocsWordmark } from "@/components/brand/wordmark";

export const GITHUB_URL = "https://github.com/engenty/engenty";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <DocsWordmark />,
      url: "/",
    },
    githubUrl: GITHUB_URL,
    // Sections are reached through the sidebar chooser and the home rooms;
    // the bar keeps only what is not a section.
    links: [
      {
        text: "Docs",
        url: "/docs/user/README",
        active: "nested-url",
        on: "nav",
      },
      { text: "Changelog", url: "/changelog", active: "nested-url" },
    ],
  };
}
