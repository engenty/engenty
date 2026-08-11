// Implementation moved to src/lib so the server-side digest service can reuse
// the same splitters; this re-export keeps the ui import paths stable.
// biome-ignore lint/performance/noBarrelFile: compatibility re-export for stable ui import paths
export {
  splitQuotedEmailHtml,
  splitQuotedPlainText,
} from "../../src/lib/email-reply-split.js";
