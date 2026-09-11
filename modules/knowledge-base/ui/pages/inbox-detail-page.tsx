/**
 * Legacy inbox route — redirects to Sources (Daten-Quellen).
 */

import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useKbInboxDetailAgentUiSlice } from "../hooks/use-kb-agent-ui-slice-shell.js";
import { kbSourcesPath } from "../kb-paths.js";

export function InboxDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  useKbInboxDetailAgentUiSlice(id);

  useEffect(() => {
    navigate(kbSourcesPath(), { replace: true });
  }, [navigate]);

  return null;
}
