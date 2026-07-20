// The copilot memory page moved into the layered memory document UI
// (/settings/memory, Profile tab embeds the same working-memory viewer).
import { Navigate } from "react-router-dom";

export function CopilotMemoryRedirect() {
  return <Navigate replace to="/settings/memory?tab=profile" />;
}
