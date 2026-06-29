"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Fumadocs section tabs use URL hashes (e.g. `/docs#dev`); map them to real routes. */
const HASH_TO_PATH: Record<string, string> = {
  dev: "/docs/dev/README",
  help: "/docs/help/README",
  wip: "/docs/wip/README",
};

export default function DocsIndexPage() {
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "").toLowerCase();
    const target = (hash && HASH_TO_PATH[hash]) || "/docs/README";
    router.replace(target);
  }, [router]);

  return null;
}
