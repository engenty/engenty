import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const COMPANY_WEBSITE_PAGES_TOOL_ID = "companyWebsitePages";

const WEBSITE_PATHS = [
  "/",
  "/about",
  "/about-us",
  "/ueber-uns",
  "/kontakt",
  "/contact",
  "/impressum",
  "/imprint",
  "/legal",
];

const DEV_HOST_SUFFIXES = [".localhost"] as const;
const DEV_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);
const DEV_SERVER_WAITING_MARKERS = [
  "Waiting for",
  "The dev server on port",
  "Expecting a server on localhost",
] as const;

function isPrivateIpv4(hostname: string): boolean {
  if (/^10\./.test(hostname)) {
    return true;
  }
  if (/^192\.168\./.test(hostname)) {
    return true;
  }
  const match = hostname.match(/^172\.(\d{1,3})\./);
  if (!match) {
    return false;
  }
  const octet = Number.parseInt(match[1] ?? "", 10);
  return octet >= 16 && octet <= 31;
}

export function isPublicWebsiteUrl(value: string): boolean {
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    const hostname = url.hostname.toLowerCase();
    if (DEV_HOSTS.has(hostname)) {
      return false;
    }
    if (DEV_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
      return false;
    }
    if (isPrivateIpv4(hostname)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function normalizeWebsiteUrl(value: string): string | null {
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    if (!isPublicWebsiteUrl(url.toString())) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 5000);
}

function isSlimWaitingPage(html: string, snippet: string): boolean {
  return DEV_SERVER_WAITING_MARKERS.some(
    (marker) => html.includes(marker) || snippet.includes(marker)
  );
}

async function fetchWebsitePage(baseUrl: string, path: string) {
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; EngentyBot/1.0; +https://engenty.com)",
      },
      redirect: "follow",
    });
    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    const snippet = stripHtml(html);
    if (isSlimWaitingPage(html, snippet)) {
      return null;
    }
    if (snippet.length < 80) {
      return null;
    }

    return {
      path,
      url: `${baseUrl}${path}`,
      snippet: snippet.slice(0, 2500),
    };
  } catch {
    return null;
  }
}

export function buildCompanyWebsitePagesTool() {
  return createTool({
    id: COMPANY_WEBSITE_PAGES_TOOL_ID,
    description:
      "Fetch the main, about, contact, and imprint-style pages from a company website and return text snippets for extraction.",
    inputSchema: z.object({
      website_url: z.string().min(1),
    }),
    execute: async ({ website_url }) => {
      const baseUrl = normalizeWebsiteUrl(website_url);
      if (!baseUrl) {
        return {
          ok: false as const,
          error:
            "Invalid or non-public website URL. Use a public company website, not localhost or .local addresses.",
        };
      }

      const results = await Promise.all(
        WEBSITE_PATHS.map((path) => fetchWebsitePage(baseUrl, path))
      );
      const pages = results.filter((page) => page != null).slice(0, 4);

      return {
        ok: true as const,
        website_url: baseUrl,
        found: pages.length > 0,
        pages,
      };
    },
  });
}
