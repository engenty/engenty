/**
 * Legacy `/kb/:slug/inbox/:id` — redirects to Sources (no row backfill).
 */

import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useKbInboxDetailAgentUiSlice } from "../hooks/use-kb-agent-ui-slice-shell.js";
import { KB_MODULE_BASE, kbSourcesPath } from "../kb-paths.js";

export function InboxDetailPage() {
  const navigate = useNavigate();
  const { kbSlug, id } = useParams<{ kbSlug: string; id: string }>();
  useKbInboxDetailAgentUiSlice(id);

  useEffect(() => {
    if (kbSlug?.trim()) {
      navigate(kbSourcesPath(kbSlug), { replace: true });
    } else {
      navigate(KB_MODULE_BASE, { replace: true });
    }
  }, [kbSlug, navigate]);

  return null;
}
