// Active copilot drawer UI — mounted beside AppLayout under CopilotShellProvider
// so EngentyAgent stays above layout chrome; surfaces portal into shell anchors.

import { CopilotProviderContent } from "@/components/copilot-provider-content";

export function CopilotShellUiHost() {
  return <CopilotProviderContent />;
}
