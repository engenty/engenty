/**
 * Legacy `/kb/:slug/inbox/:id` — redirects to Sources (no row backfill).
 */

import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { KB_MODULE_BASE, kbSourcesPath } from "../kb-paths.js";

export function InboxDetailPage() {
  const navigate = useNavigate();
  const { kbSlug } = useParams<{ kbSlug: string }>();

  useEffect(() => {
    if (kbSlug?.trim()) {
      navigate(kbSourcesPath(kbSlug), { replace: true });
    } else {
      navigate(KB_MODULE_BASE, { replace: true });
    }
  }, [kbSlug, navigate]);

  return null;
}
