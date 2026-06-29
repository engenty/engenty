/**
 * Tighter typography for `MessageResponse` + Tailwind `prose` in admin previews
 * (settings, skill view tab, instruction effective body).
 */
export const COMPACT_MARKDOWN_PROSE_CLASSNAME = [
  "prose prose-sm dark:prose-invert max-w-none text-sm leading-snug",
  "[&_p]:my-1 [&_p]:leading-snug",
  "[&_h1]:mb-1 [&_h1]:mt-3 [&_h1]:text-base",
  "[&_h2]:mb-1 [&_h2]:mt-3 [&_h2]:text-[0.9375rem]",
  "[&_h3]:mb-0.5 [&_h3]:mt-2 [&_h3]:text-sm",
  "[&_h4]:mb-0.5 [&_h4]:mt-2",
  "[&_ul]:my-1 [&_ol]:my-1",
  "[&_li]:my-0 [&_li]:leading-snug",
  "[&_li>p]:mb-0 [&_li>p]:mt-0",
  "[&_hr]:my-2",
  "[&_blockquote]:my-1.5",
  "[&_pre]:my-1.5",
].join(" ");
