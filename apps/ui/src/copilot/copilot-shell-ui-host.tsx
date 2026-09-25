// Active copilot drawer UI — mounted beside AppLayout under CopilotShellProvider
// so EngentyAgent stays above layout chrome; surfaces portal into shell anchors.

import { memo } from "react";
import { CopilotProviderContent } from "@/components/copilot-provider-content";

export const CopilotShellUiHost = memo(function CopilotShellUiHost() {
  return <CopilotProviderContent />;
});
