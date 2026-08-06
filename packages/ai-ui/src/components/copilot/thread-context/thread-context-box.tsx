"use client";

import { formatObjectRef } from "@engenty/ai-core/browser";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
} from "@engenty/ui-core";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import { activateArtifact } from "../../../artifacts/artifact-store.js";
import { useObjectDisplayIntent } from "../../../objects/object-display-intent.js";
import {
  iconForArtifactType,
  iconForObjectRef,
  iconForSourceUrl,
} from "./thread-context-icons.js";
import type { ThreadContextSummary } from "./thread-context-types.js";

export interface ThreadContextBoxProps {
  className?: string;
  hostKey: string;
  summary: ThreadContextSummary;
}

/**
 * Compact floating context card — sidebar-style group headings with
 * always-visible item rows (type icon when we can resolve one).
 */
export function ThreadContextBox({
  className,
  hostKey,
  summary,
}: ThreadContextBoxProps) {
  const { t } = useTranslation("ai-ui");
  const { openInPanel } = useObjectDisplayIntent();

  if (summary.isEmpty) {
    return null;
  }

  return (
    <aside
      aria-label={t("threadContext.label")}
      className={cn(
        "ui-card-elevated flex max-h-[min(60vh,480px)] w-full flex-col overflow-hidden rounded-lg bg-card text-card-foreground",
        className
      )}
    >
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-1.5 py-2.5">
        {summary.artefacts.length > 0 ? (
          <ContextSection label={t("threadContext.artefacts")}>
            {summary.artefacts.map((item) => (
              <ContextRow
                icon={iconForArtifactType(item.type)}
                key={item.id}
                label={item.title}
                onClick={() => activateArtifact(hostKey, item.id)}
              />
            ))}
          </ContextSection>
        ) : null}
        {summary.objects.length > 0 ? (
          <ContextSection label={t("threadContext.objects")}>
            {summary.objects.map((item) => {
              const key = formatObjectRef(item.ref);
              const icon = iconForObjectRef(item.ref);
              if (openInPanel) {
                return (
                  <ContextRow
                    icon={icon}
                    key={key}
                    label={item.title}
                    onClick={() => openInPanel(item.ref, { title: item.title })}
                  />
                );
              }
              if (item.href) {
                return (
                  <ContextRow
                    href={item.href}
                    icon={icon}
                    key={key}
                    label={item.title}
                  />
                );
              }
              return <ContextRow icon={icon} key={key} label={item.title} />;
            })}
          </ContextSection>
        ) : null}
        {summary.sources.length > 0 ? (
          <ContextSection label={t("threadContext.sources")}>
            {summary.sources.map((item) => {
              const icon = iconForSourceUrl(item.url);
              const isInternal =
                item.url.startsWith("/") ||
                item.url.includes("/kb/") ||
                item.url.includes("/mdl/");
              if (isInternal) {
                const path = item.url.replace(/^https?:\/\/[^/]+/, "");
                return (
                  <ContextRow
                    href={path}
                    icon={icon}
                    key={item.url}
                    label={item.title}
                  />
                );
              }
              return (
                <ContextRow
                  externalUrl={item.url}
                  icon={icon}
                  key={item.url}
                  label={item.title}
                />
              );
            })}
          </ContextSection>
        ) : null}
      </div>
    </aside>
  );
}

const rowClassName =
  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground/90 transition-colors hover:bg-muted/70";

const rowIconClassName = "size-3.5 shrink-0 text-muted-foreground/70";

function ContextSection({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  const [open, setOpen] = useState(true);

  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <CollapsibleTrigger className="group mb-1 flex w-full items-center gap-1 rounded-md px-2 py-0.5 text-left outline-none hover:bg-muted/50 focus-visible:bg-muted/50">
        <span className="min-w-0 flex-1 text-muted-foreground text-xxs uppercase tracking-[0.1em]">
          {label}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "size-3 shrink-0 text-muted-foreground/70 opacity-0 transition-[opacity,transform] group-hover:opacity-100 group-focus-visible:opacity-100",
            open && "rotate-180"
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-0.5">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function ContextRow({
  externalUrl,
  href,
  icon: Icon,
  label,
  onClick,
}: {
  externalUrl?: string;
  href?: string;
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <Icon aria-hidden className={rowIconClassName} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </>
  );

  if (onClick) {
    return (
      <button className={rowClassName} onClick={onClick} type="button">
        {content}
      </button>
    );
  }
  if (href) {
    return (
      <Link className={rowClassName} to={href}>
        {content}
      </Link>
    );
  }
  if (externalUrl) {
    return (
      <a
        className={rowClassName}
        href={externalUrl}
        rel="noopener noreferrer"
        target="_blank"
      >
        {content}
      </a>
    );
  }
  return <div className={rowClassName}>{content}</div>;
}
