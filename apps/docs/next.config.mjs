import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyWorkspaceDotEnvLayers } from "@engenty/environment/env";
import { createMDX } from "fumadocs-mdx/next";

const docsDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(docsDir, "../..");
applyWorkspaceDotEnvLayers(workspaceRoot, docsDir);

const withMDX = createMDX();

function docsAllowedDevOrigin() {
  const raw = process.env.NEXT_PUBLIC_DOCS_SITE_URL?.trim();
  if (!raw) {
    return "docs.engenty.localhost";
  }
  return new URL(raw).hostname;
}

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  /** Portless + dev gateway: HMR when opened via docs.engenty.localhost or engenty.localhost/docs */
  allowedDevOrigins: [docsAllowedDevOrigin(), "engenty.localhost"],
  /** Mermaid is large ESM; transpilation avoids subtle Turbopack/webpack issues. */
  transpilePackages: ["mermaid"],
  /** The flat engenty mascots come straight from ui-core source (tsconfig paths). */
  experimental: { externalDir: true },
  serverExternalPackages: ["typescript", "twoslash"],
  async rewrites() {
    return [
      {
        source: "/docs/:path*.mdx",
        destination: "/llms.mdx/docs/:path*",
      },
    ];
  },
};

export default withMDX(config);
