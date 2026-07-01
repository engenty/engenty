/**
 * Legacy `/kb/:slug/inbox` — redirects to Sources (Daten-Quellen).
 */

import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { KB_MODULE_BASE, kbSourcesPath } from "../kb-paths.js";

export function InboxListPage() {
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
