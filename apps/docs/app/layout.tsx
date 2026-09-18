import { RootProvider } from "fumadocs-ui/provider/next";
import "./global.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

function resolveDocsSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_DOCS_SITE_URL?.trim();
  // Local/dev fallback so the build needs no portless env wiring. The value only
  // sets metadataBase (canonical/OG URLs); production sets the real site URL.
  return raw && raw.length > 0 ? raw : "http://localhost:3002";
}

export const metadata: Metadata = {
  metadataBase: new URL(resolveDocsSiteUrl()),
  title: {
    default: "Engenty documentation",
    template: "%s · Engenty Docs",
  },
  description:
    "Developer documentation for the Engenty monorepo: plugins, sync, security, and UI.",
  icons: {
    icon: [
      { url: "/favicon.apng", type: "image/apng" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", type: "image/x-icon", sizes: "32x32" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e0531b" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1a1a" },
  ],
};

export default function Layout({ children }: LayoutProps<"/">) {
  // RootProvider accepts children but types are incomplete - using type assertion
  const RootProviderWithChildren = RootProvider as React.ComponentType<{
    children: ReactNode;
  }>;

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProviderWithChildren>{children}</RootProviderWithChildren>
      </body>
    </html>
  );
}
