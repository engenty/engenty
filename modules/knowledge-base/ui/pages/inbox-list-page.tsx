/**
 * Legacy inbox route — redirects to Sources (Daten-Quellen).
 */

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useKbInboxListAgentUiSlice } from "../hooks/use-kb-agent-ui-slice-shell.js";
import { kbSourcesPath } from "../kb-paths.js";

export function InboxListPage() {
  const navigate = useNavigate();
  useKbInboxListAgentUiSlice();

  useEffect(() => {
    navigate(kbSourcesPath(), { replace: true });
  }, [navigate]);

  return null;
}
