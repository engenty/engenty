import { useTranslation } from "@engenty/i18n/ui";
import {
  markdownToJson,
  RichEditor,
  type RichEditorLinkClickHandler,
} from "@engenty/tiptap-editor";
import "@engenty/tiptap-editor/styles.css";
import type { JSONContent } from "@engenty/tiptap-editor";
import {
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@engenty/ui-core";
import { useMemo } from "react";
import type {
  KbSourceItemLink,
  KbSourceItemMedia,
  KbSourceItemSection,
} from "../../src/schema/types.js";
import { SourceItemLinksPanel } from "./source-item-links-panel.js";
import { SourceItemMediaPanel } from "./source-item-media-panel.js";

export type SourceItemBodyTab =
  | "parsed"
  | "raw"
  | "html"
  | "sections"
  | "media"
  | "links";

function formatHtmlSource(html: string): string {
  return html
    .replace(/></g, ">\n<")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function SourceItemContentTabs({
  activeTab,
  inboxBodyLoading,
  links,
  markdownBody,
  media,
  onLinkClick,
  onTabChange,
  rawHtmlBody,
  sections,
}: {
  activeTab: SourceItemBodyTab;
  inboxBodyLoading: boolean;
  links: KbSourceItemLink[];
  markdownBody: string;
  media: KbSourceItemMedia[];
  onLinkClick: RichEditorLinkClickHandler;
  onTabChange: (tab: SourceItemBodyTab) => void;
  rawHtmlBody: string;
  sections: KbSourceItemSection[];
}) {
  const { t } = useTranslation("kb");
  const formattedRawHtml = useMemo(
    () => (rawHtmlBody.trim() ? formatHtmlSource(rawHtmlBody) : ""),
    [rawHtmlBody]
  );
  const bodyJson = useMemo((): JSONContent | null => {
    if (!markdownBody.trim()) {
      return null;
    }
    try {
      return markdownToJson(markdownBody);
    } catch {
      return null;
    }
  }, [markdownBody]);

  const hasMarkdownBody = Boolean(markdownBody.trim());
  const hasRawHtmlBody = Boolean(rawHtmlBody.trim());

  if (inboxBodyLoading) {
    return (
      <div className="ui-card-panel w-full min-w-0 px-3 py-3 sm:px-4">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <Tabs
      className="flex w-full min-w-0 flex-col gap-0"
      onValueChange={(value) => {
        if (
          value === "parsed" ||
          value === "raw" ||
          value === "html" ||
          value === "sections" ||
          value === "media" ||
          value === "links"
        ) {
          onTabChange(value);
        }
      }}
      value={activeTab}
    >
      <div className="flex w-full min-w-0 flex-wrap items-end gap-x-4 gap-y-2">
        <TabsList
          className="w-fit shrink-0 border-0 bg-transparent px-2 pt-0 pb-0"
          variant="line"
        >
          <TabsTrigger value="parsed">
            {t("sources.source_item_tab_parsed")}
          </TabsTrigger>
          <TabsTrigger value="raw">
            {t("sources.source_item_tab_raw")}
          </TabsTrigger>
          <TabsTrigger value="html">
            {t("sources.source_item_tab_html")}
          </TabsTrigger>
          <TabsTrigger value="sections">
            {t("sources.source_item_tab_sections")}
          </TabsTrigger>
          <TabsTrigger value="media">
            {t("sources.source_item_tab_media")}
          </TabsTrigger>
          <TabsTrigger value="links">
            {t("sources.source_item_tab_links")}
          </TabsTrigger>
        </TabsList>
      </div>
      <div className="ui-card-panel w-full min-w-0 overflow-x-auto px-3 py-3 sm:px-4">
        <TabsContent className="mt-0 min-w-0 outline-none" value="parsed">
          {bodyJson ? (
            <RichEditor
              className="w-full min-w-0"
              content={bodyJson}
              editable={false}
              onLinkClick={onLinkClick}
              showToolbar={false}
            />
          ) : hasMarkdownBody ? (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <div className="whitespace-pre-wrap">{markdownBody}</div>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              {t("sources.source_item_no_markdown")}
            </p>
          )}
        </TabsContent>
        <TabsContent className="mt-0 min-w-0 outline-none" value="raw">
          <pre className="max-h-[min(70vh,32rem)] min-w-0 overflow-auto whitespace-pre-wrap font-mono text-foreground text-xs leading-relaxed">
            {markdownBody || t("sources.source_item_no_markdown")}
          </pre>
        </TabsContent>
        <TabsContent className="mt-0 min-w-0 outline-none" value="html">
          {hasRawHtmlBody ? (
            <pre className="max-h-[min(70vh,32rem)] min-w-0 overflow-auto whitespace-pre-wrap font-mono text-foreground text-xs leading-relaxed">
              {formattedRawHtml}
            </pre>
          ) : (
            <p className="text-muted-foreground text-sm">
              {t("sources.source_item_no_raw_html")}
            </p>
          )}
        </TabsContent>
        <TabsContent className="mt-0 min-w-0 outline-none" value="sections">
          <SourceItemSectionsPanel sections={sections} />
        </TabsContent>
        <TabsContent className="mt-0 min-w-0 outline-none" value="media">
          <SourceItemMediaPanel media={media} />
        </TabsContent>
        <TabsContent className="mt-0 min-w-0 outline-none" value="links">
          <SourceItemLinksPanel links={links} />
        </TabsContent>
      </div>
    </Tabs>
  );
}

function SourceItemSectionsPanel({
  sections,
}: {
  sections: KbSourceItemSection[];
}) {
  const { t } = useTranslation("kb");
  if (sections.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {t("sources.source_item_no_sections")}
      </p>
    );
  }
  return (
    <div className="flex min-w-0 flex-col divide-y rounded-md border">
      {sections.map((section) => (
        <details className="group p-3" key={section.id}>
          <summary className="cursor-pointer list-none">
            <span className="font-medium text-sm">
              {section.title || section.locator || section.kind}
            </span>
            <span className="ml-2 text-muted-foreground text-xs">
              {section.kind}
            </span>
          </summary>
          <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-3 font-mono text-xs">
            {section.content}
          </pre>
        </details>
      ))}
    </div>
  );
}
