import { DetailPageHeader, Tabs } from "@engenty/ui-core";
import type { ReactNode } from "react";
import {
  EngentyListSubNav,
  type EngentyListTab,
} from "./engenty-list-sub-nav.js";
import { useEngentyListTabNavigation } from "./use-engenty-list-tab-navigation.js";

interface EngentyCatalogPageChromeProps {
  children: ReactNode;
  description?: ReactNode;
  tab: EngentyListTab;
  title: ReactNode;
}

/** Canvas header + sibling catalog tabs (Plan list-hub pattern). */
export function EngentyCatalogPageChrome({
  children,
  description,
  tab,
  title,
}: EngentyCatalogPageChromeProps) {
  const onTabChange = useEngentyListTabNavigation();

  return (
    <Tabs
      className="flex min-h-0 w-full flex-1 flex-col overflow-hidden"
      onValueChange={onTabChange}
      value={tab}
    >
      <DetailPageHeader
        aboveStrip={<EngentyListSubNav />}
        aboveStripAlign="center"
        description={description ? <p>{description}</p> : undefined}
        maxWidth="5xl"
        title={title}
        variant="canvas"
      />
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto pb-10">
        <div className="mx-auto mt-2 flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-4 px-page md:mt-3">
          {children}
        </div>
      </div>
    </Tabs>
  );
}

interface EngentyCanvasPageChromeProps {
  children: ReactNode;
  description?: ReactNode;
  title: ReactNode;
}

/** Canvas header without catalog sibling tabs (overview / activity / connections). */
export function EngentyCanvasPageChrome({
  children,
  description,
  title,
}: EngentyCanvasPageChromeProps) {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <DetailPageHeader
        description={description ? <p>{description}</p> : undefined}
        maxWidth="5xl"
        title={title}
        variant="canvas"
      />
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto pb-10">
        <div className="mx-auto mt-2 flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-4 px-page md:mt-3">
          {children}
        </div>
      </div>
    </div>
  );
}
