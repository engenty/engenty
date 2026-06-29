import { Navigate, useParams } from "react-router-dom";
import { resolveChatLegacyRedirectTarget } from "./chat-legacy-redirect.js";

/** Explicit bookmark cutover from legacy `/chat/:threadId` to module chat. */
export function ChatLegacySessionRedirect() {
  const { threadId } = useParams<{ threadId: string }>();
  return <Navigate replace to={resolveChatLegacyRedirectTarget(threadId)} />;
}
