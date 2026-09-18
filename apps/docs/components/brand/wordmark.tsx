import { LogoMark } from "./mascot";

/** Brand lockup for the top bar: cycling mark + `engenty.` + a DOCS tag. */
export function DocsWordmark() {
  return (
    <span className="docs-wordmark">
      <LogoMark size={30} />
      <span className="docs-wordmark-text">
        engenty<span className="docs-wordmark-dot">.</span>
      </span>
      <span className="docs-wordmark-tag">docs</span>
    </span>
  );
}
