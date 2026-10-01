/**
 * The agent's window in a Space's browser, drawn in the chat: beside a
 * decision (`preview` on the open interrupt) or as a tool's own output
 * (`browser_show`). One shape for both, parsed in one place.
 *
 * - `browser` / `setup`: the browser's state, Start, and the Space's switches.
 * - `browser` / `live`: the live view, with take over.
 * - `browser_screenshot`: one frame, with the agent's marks on it. Marks are
 *   in the page's CSS pixels; `width`/`height` are the page's viewport, so a
 *   client draws them over the image with that viewBox.
 * - `browser_credentials`: a login form for fields on the page. What is typed
 *   goes to the fill route under `request_id`, never into the run.
 * - `secret_request`: a token or password a host tool needs (e.g. git_remote),
 *   for `target`. What is typed goes to the secrets route under `request_id`,
 *   never into the run.
 */

export type AgUiBrowserAnnotationShape =
  | "arrow"
  | "box"
  | "circle"
  | "highlight";
export type AgUiBrowserAnnotationColor = "amber" | "blue" | "green" | "red";

export interface AgUiBrowserAnnotation {
  color: AgUiBrowserAnnotationColor;
  height: number;
  label?: string;
  shape: AgUiBrowserAnnotationShape;
  width: number;
  x: number;
  y: number;
}

export interface AgUiBrowserWindowRef {
  agent_id: string;
  space_id: string;
}

export type AgUiBrowserCredentialFieldKind =
  | "otp"
  | "password"
  | "text"
  | "username";

export interface AgUiBrowserCredentialField {
  id: string;
  kind: AgUiBrowserCredentialFieldKind;
  label: string;
}

/** A frame with marks: the screenshot preview without its window ref. */
export interface AgUiBrowserFrame {
  annotations: AgUiBrowserAnnotation[];
  height: number;
  /** `data:image/jpeg;base64,…` */
  image: string;
  width: number;
}

export type AgUiBrowserPreview =
  | (AgUiBrowserWindowRef & { kind: "browser"; mode: "live" | "setup" })
  | (AgUiBrowserWindowRef & {
      annotations: AgUiBrowserAnnotation[];
      height: number;
      /** `data:image/jpeg;base64,…` */
      image: string;
      kind: "browser_screenshot";
      title?: string;
      url?: string;
      width: number;
    })
  | (AgUiBrowserWindowRef & {
      fields: AgUiBrowserCredentialField[];
      /** The choice that resumes the run once the fill route succeeded. */
      filled_choice_id: string;
      kind: "browser_credentials";
      /** The site the values go to, read from the page by the server. */
      origin: string;
      request_id: string;
      screenshot?: AgUiBrowserFrame;
    })
  | (AgUiBrowserWindowRef & {
      fields: AgUiBrowserCredentialField[];
      /** The choice that resumes the run once the secrets route succeeded. */
      filled_choice_id: string;
      kind: "secret_request";
      request_id: string;
      /** What the secret is for, e.g. the repository URL. */
      target: string;
    });

const SHAPES = new Set<string>(["arrow", "box", "circle", "highlight"]);
const COLORS = new Set<string>(["amber", "blue", "green", "red"]);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readAnnotation(raw: unknown): AgUiBrowserAnnotation | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const r = raw as Record<string, unknown>;
  if (
    !(
      isFiniteNumber(r.x) &&
      isFiniteNumber(r.y) &&
      isFiniteNumber(r.width) &&
      isFiniteNumber(r.height)
    )
  ) {
    return null;
  }
  const label = readString(r.label);
  return {
    color:
      typeof r.color === "string" && COLORS.has(r.color)
        ? (r.color as AgUiBrowserAnnotationColor)
        : "red",
    height: r.height,
    ...(label ? { label } : {}),
    shape:
      typeof r.shape === "string" && SHAPES.has(r.shape)
        ? (r.shape as AgUiBrowserAnnotationShape)
        : "box",
    width: r.width,
    x: r.x,
    y: r.y,
  };
}

const FIELD_KINDS = new Set<string>(["otp", "password", "text", "username"]);

function readFrame(raw: unknown): AgUiBrowserFrame | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const r = raw as Record<string, unknown>;
  if (
    typeof r.image !== "string" ||
    !r.image.startsWith("data:image/") ||
    !isFiniteNumber(r.width) ||
    !isFiniteNumber(r.height) ||
    r.width <= 0 ||
    r.height <= 0
  ) {
    return null;
  }
  return {
    annotations: Array.isArray(r.annotations)
      ? r.annotations.flatMap((a) => readAnnotation(a) ?? [])
      : [],
    height: r.height,
    image: r.image,
    width: r.width,
  };
}

function readCredentialFields(raw: unknown): AgUiBrowserCredentialField[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }
    const r = entry as Record<string, unknown>;
    const id = readString(r.id);
    const label = readString(r.label);
    if (
      !(id && label && typeof r.kind === "string" && FIELD_KINDS.has(r.kind))
    ) {
      return [];
    }
    return [{ id, kind: r.kind as AgUiBrowserCredentialFieldKind, label }];
  });
}

/** A browser preview, or null for anything else (a workflow preview, junk). */
export function readAgUiBrowserPreview(
  raw: unknown
): AgUiBrowserPreview | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const r = raw as Record<string, unknown>;
  const agentId = readString(r.agent_id);
  const spaceId = readString(r.space_id);
  if (!(agentId && spaceId)) {
    return null;
  }
  if (r.kind === "browser" && (r.mode === "live" || r.mode === "setup")) {
    return {
      agent_id: agentId,
      kind: "browser",
      mode: r.mode,
      space_id: spaceId,
    };
  }
  if (r.kind === "browser_screenshot") {
    const frame = readFrame(r);
    if (!frame) {
      return null;
    }
    const title = readString(r.title);
    const url = readString(r.url);
    return {
      agent_id: agentId,
      ...frame,
      kind: "browser_screenshot",
      space_id: spaceId,
      ...(title ? { title } : {}),
      ...(url ? { url } : {}),
    };
  }
  if (r.kind === "browser_credentials") {
    const requestId = readString(r.request_id);
    const origin = readString(r.origin);
    const filledChoiceId = readString(r.filled_choice_id);
    const fields = readCredentialFields(r.fields);
    if (!(requestId && origin && filledChoiceId && fields.length > 0)) {
      return null;
    }
    const screenshot = readFrame(r.screenshot);
    return {
      agent_id: agentId,
      fields,
      filled_choice_id: filledChoiceId,
      kind: "browser_credentials",
      origin,
      request_id: requestId,
      ...(screenshot ? { screenshot } : {}),
      space_id: spaceId,
    };
  }
  if (r.kind === "secret_request") {
    const requestId = readString(r.request_id);
    const target = readString(r.target);
    const filledChoiceId = readString(r.filled_choice_id);
    const fields = readCredentialFields(r.fields);
    if (!(requestId && target && filledChoiceId && fields.length > 0)) {
      return null;
    }
    return {
      agent_id: agentId,
      fields,
      filled_choice_id: filledChoiceId,
      kind: "secret_request",
      request_id: requestId,
      space_id: spaceId,
      target,
    };
  }
  return null;
}
