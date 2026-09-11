/**
 * The header an agent-to-agent message carries when it lands as the user
 * turn of the colleague's thread. The row is attributed to the person whose
 * room it is, so the text itself says who is speaking — the colleague's model
 * reads it, and the transcript turns it into a "Message from …" line instead
 * of a bubble that looks like the person typed it.
 */

const HEADER_RE =
  /^\*\*Message from (.+?)\*\* \(engenty `([^`]+)`\)\r?\n(?:\r?\n)?/;
/**
 * A shared-room turn may be persisted inside its speaker envelope
 * (`<turn author_id=… author_name=… functional_role="user">`); the header
 * then follows the tag, and the envelope stays on the body.
 */
const TURN_OPEN_RE = /^<turn\b[^>]*>\s*/i;

export function formatAgentMessageHeader(
  senderName: string,
  senderId: string
): string {
  return `**Message from ${senderName}** (engenty \`${senderId}\`)\n\n`;
}

export interface AgentMessageHeader {
  /** The message without its header. */
  body: string;
  senderId: string;
  senderName: string;
}

/** The sender and the body, or null when the text is not an agent message. */
export function parseAgentMessageHeader(
  text: string
): AgentMessageHeader | null {
  const envelope = TURN_OPEN_RE.exec(text)?.[0] ?? "";
  const rest = text.slice(envelope.length);
  const match = HEADER_RE.exec(rest);
  if (!match) {
    return null;
  }
  return {
    body: `${envelope}${rest.slice(match[0].length)}`,
    senderId: match[2] ?? "",
    senderName: match[1] ?? "",
  };
}
