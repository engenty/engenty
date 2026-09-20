import { Fragment, type ReactNode } from "react";

/**
 * Minimal markdown → React renderer for the `Markdown` component: headings,
 * paragraphs, bullet/numbered lists, bold, italic, inline code and http(s)
 * links. Everything is emitted as React elements — raw HTML in the source is
 * shown as text, never injected.
 */

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const INLINE =
  /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|(?<![\w*])[*_][^*_]+[*_](?![\w*]))/g;

function renderInline(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > last) {
      parts.push(text.slice(last, index));
    }
    const token = match[0];
    if (token.startsWith("**")) {
      parts.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      parts.push(
        <code
          className="rounded bg-muted px-1 font-mono text-[0.85em]"
          key={key++}
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("[")) {
      const close = token.indexOf("](");
      const label = token.slice(1, close);
      const href = token.slice(close + 2, -1);
      parts.push(
        <a
          className="underline underline-offset-2"
          href={href}
          key={key++}
          rel="noopener noreferrer"
          target="_blank"
        >
          {label}
        </a>
      );
    } else {
      parts.push(<em key={key++}>{token.slice(1, -1)}</em>);
    }
    last = index + token.length;
  }
  if (last < text.length) {
    parts.push(text.slice(last));
  }
  return parts;
}

type Block =
  | { items: string[]; kind: "ol" | "ul" }
  | { level: number; kind: "heading"; text: string }
  | { kind: "p"; text: string };

function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: "p", text: paragraph.join(" ") });
      paragraph = [];
    }
  };
  for (const line of source.split(/\r?\n/)) {
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({
        kind: "heading",
        level: heading[1].length,
        text: heading[2],
      });
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    const item = bullet ?? numbered;
    if (item) {
      flush();
      const kind = bullet ? "ul" : "ol";
      const previous = blocks.at(-1);
      if (previous && previous.kind === kind) {
        previous.items.push(item[1]);
      } else {
        blocks.push({ items: [item[1]], kind });
      }
      continue;
    }
    if (line.trim() === "") {
      flush();
      continue;
    }
    paragraph.push(line.trim());
  }
  flush();
  return blocks;
}

const HEADING_CLASSES: Record<number, string> = {
  1: "font-semibold text-base text-foreground",
  2: "font-semibold text-base text-foreground",
  3: "font-semibold text-sm text-foreground",
};

export function renderMarkdown(source: string): ReactNode {
  return parseBlocks(source).map((block, index) => {
    switch (block.kind) {
      case "heading": {
        const Tag = `h${Math.min(block.level + 2, 6)}` as
          | "h3"
          | "h4"
          | "h5"
          | "h6";
        return (
          <Tag
            className={
              HEADING_CLASSES[block.level] ??
              "font-medium text-foreground text-sm"
            }
            key={index}
          >
            {renderInline(block.text)}
          </Tag>
        );
      }
      case "ul":
      case "ol": {
        const Tag = block.kind;
        return (
          <Tag
            className={
              block.kind === "ul"
                ? "list-disc pl-5 text-foreground/90 text-sm"
                : "list-decimal pl-5 text-foreground/90 text-sm"
            }
            key={index}
          >
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>{renderInline(item)}</li>
            ))}
          </Tag>
        );
      }
      default:
        return (
          <Fragment key={index}>
            <p className="text-foreground/90 text-sm">
              {renderInline(block.text)}
            </p>
          </Fragment>
        );
    }
  });
}
