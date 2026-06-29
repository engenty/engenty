"use client";

import {
  Badge,
  Button,
  cn,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@engenty/ui-core";
import { Activity, Bug, Maximize2, Minimize2, X } from "lucide-react";
import {
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ENGENTY_COPILOT_HOST_KEY,
  useAgentHost,
} from "../../agent-provider/index.js";
import {
  useAgUiDebugEvents,
  useDeveloperModeEnabled,
} from "./ag-ui-inspector-hooks.js";
import {
  buildToolCallTree,
  extractInitialPrompt,
} from "./ag-ui-inspector-model.js";
import {
  JsonPanel,
  PromptPanel,
  TimelinePanel,
  ToolsPanel,
} from "./ag-ui-inspector-panels.js";

const STORAGE_KEY = "engenty.ag_ui_inspector.v1";
const OPEN_INSPECTOR_EVENT = "engenty:ag-ui-inspector:open";
const LAUNCHER_WIDTH = 108;
const LAUNCHER_HEIGHT = 36;
const PANEL_WIDTH = 780;
const PANEL_HEADER_HEIGHT = 40;

interface InspectorLayout {
  launcherX: number;
  launcherY: number;
  minimized: boolean;
  open: boolean;
  x: number;
  y: number;
}

export interface AgUiAgentInspectorWidgetProps {
  serviceBaseUrl: string;
}

export function openAgUiAgentInspector() {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(OPEN_INSPECTOR_EVENT));
}

function defaultLauncherPosition() {
  if (typeof window === "undefined") {
    return { launcherX: 24, launcherY: 88 };
  }
  return {
    launcherX: Math.max(8, window.innerWidth - 120),
    launcherY: Math.max(8, window.innerHeight - 56),
  };
}

function defaultLayout(): InspectorLayout {
  return {
    ...defaultLauncherPosition(),
    minimized: false,
    open: false,
    x: 24,
    y: 88,
  };
}

function clampPosition(
  x: number,
  y: number,
  bounds: { height: number; width: number }
) {
  if (typeof window === "undefined") {
    return { x: Math.max(8, x), y: Math.max(8, y) };
  }
  return {
    x: Math.min(Math.max(8, x), Math.max(8, window.innerWidth - bounds.width)),
    y: Math.min(
      Math.max(8, y),
      Math.max(8, window.innerHeight - bounds.height)
    ),
  };
}

function readLayout(): InspectorLayout {
  if (typeof localStorage === "undefined") {
    return defaultLayout();
  }
  try {
    const parsed = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "{}"
    ) as Partial<InspectorLayout> | null;
    const launcher = clampPosition(
      typeof parsed?.launcherX === "number"
        ? parsed.launcherX
        : defaultLauncherPosition().launcherX,
      typeof parsed?.launcherY === "number"
        ? parsed.launcherY
        : defaultLauncherPosition().launcherY,
      { height: LAUNCHER_HEIGHT, width: LAUNCHER_WIDTH }
    );
    const panel = clampPosition(
      typeof parsed?.x === "number" ? parsed.x : 24,
      typeof parsed?.y === "number" ? parsed.y : 88,
      { height: PANEL_HEADER_HEIGHT, width: PANEL_WIDTH }
    );
    return {
      ...defaultLayout(),
      ...parsed,
      launcherX: launcher.x,
      launcherY: launcher.y,
      x: panel.x,
      y: panel.y,
    };
  } catch {
    return defaultLayout();
  }
}

function writeLayout(layout: InspectorLayout) {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
}

function laneStatusClass(status: string): string {
  if (status === "streaming" || status === "submitted") {
    return "text-amber-600 dark:text-amber-400";
  }
  if (status === "error") {
    return "text-red-600 dark:text-red-400";
  }
  return "text-emerald-600 dark:text-emerald-400";
}

export function AgUiAgentInspectorWidget({
  serviceBaseUrl,
}: AgUiAgentInspectorWidgetProps) {
  const developerModeEnabled = useDeveloperModeEnabled();
  const host = useAgentHost(ENGENTY_COPILOT_HOST_KEY);
  const debugEvents = useAgUiDebugEvents(serviceBaseUrl, developerModeEnabled);
  const [layout, setLayout] = useState(readLayout);
  const dragRef = useRef<{
    moved: boolean;
    pointerId: number;
    startX: number;
    startY: number;
    target: "launcher" | "panel";
    targetHeight: number;
    targetWidth: number;
    x: number;
    y: number;
  } | null>(null);
  const suppressNextLauncherClickRef = useRef(false);

  useEffect(() => {
    writeLayout(layout);
  }, [layout]);

  const events = debugEvents.length > 0 ? debugEvents : host.events;
  const toolCalls = useMemo(() => buildToolCallTree(events), [events]);
  const initialPrompt = useMemo(() => extractInitialPrompt(events), [events]);

  const patchLayout = useCallback((patch: Partial<InspectorLayout>) => {
    setLayout((current) => ({ ...current, ...patch }));
  }, []);

  useEffect(() => {
    const open = () => {
      patchLayout({ minimized: false, open: true });
    };
    window.addEventListener(OPEN_INSPECTOR_EVENT, open);
    return () => window.removeEventListener(OPEN_INSPECTOR_EVENT, open);
  }, [patchLayout]);

  if (!developerModeEnabled) {
    return null;
  }

  const onPointerDown = (
    event: PointerEvent<HTMLElement>,
    target: "launcher" | "panel"
  ) => {
    dragRef.current = {
      moved: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      target,
      targetHeight:
        target === "launcher"
          ? event.currentTarget.offsetHeight || LAUNCHER_HEIGHT
          : PANEL_HEADER_HEIGHT,
      targetWidth:
        target === "launcher"
          ? event.currentTarget.offsetWidth || LAUNCHER_WIDTH
          : Math.min(PANEL_WIDTH, window.innerWidth - 16),
      x: target === "launcher" ? layout.launcherX : layout.x,
      y: target === "launcher" ? layout.launcherY : layout.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 3) {
      drag.moved = true;
    }
    const next = clampPosition(drag.x + deltaX, drag.y + deltaY, {
      height: drag.targetHeight,
      width: drag.targetWidth,
    });
    patchLayout(
      drag.target === "launcher"
        ? { launcherX: next.x, launcherY: next.y }
        : { x: next.x, y: next.y }
    );
  };

  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (drag?.pointerId === event.pointerId) {
      if (drag.target === "launcher" && drag.moved) {
        suppressNextLauncherClickRef.current = true;
      }
      dragRef.current = null;
    }
  };

  if (!layout.open) {
    return (
      <Button
        className="fixed z-[90] h-9 gap-1.5 rounded-full border border-border/80 bg-card px-3 font-mono text-xs shadow-md"
        onClick={() => {
          if (suppressNextLauncherClickRef.current) {
            suppressNextLauncherClickRef.current = false;
            return;
          }
          patchLayout({ open: true });
        }}
        onPointerDown={(event) => onPointerDown(event, "launcher")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        size="sm"
        style={{ left: layout.launcherX, top: layout.launcherY }}
        type="button"
        variant="outline"
      >
        <Bug className="size-3.5 text-violet-600" />
        AG-UI
      </Button>
    );
  }

  return (
    <div
      className="fixed z-[90] flex max-h-[min(82vh,760px)] w-[min(92vw,780px)] flex-col overflow-hidden rounded-lg border border-border/80 bg-card shadow-[0_8px_32px_oklch(0.4_0.02_60/0.12)]"
      style={{ left: layout.x, top: layout.y }}
    >
      <div
        className="flex h-10 shrink-0 cursor-move items-center gap-2 border-border/70 border-b bg-muted/25 px-3"
        onPointerDown={(event) => onPointerDown(event, "panel")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <Activity className="size-3.5 text-violet-600" />
        <span className="font-medium font-mono text-sm tracking-tight">
          AG-UI Inspector
        </span>
        <span
          className={cn(
            "font-mono text-[11px] uppercase",
            laneStatusClass(host.status)
          )}
        >
          {host.status}
        </span>
        <span className="min-w-0 flex-1 space-y-0.5 truncate font-mono text-[11px] text-muted-foreground">
          <span className="block truncate" title={host.threadId ?? undefined}>
            thread (session): {host.threadId ?? "none"}
          </span>
          <span className="block truncate" title={host.config.agentId}>
            agent: {host.config.agentId}
          </span>
        </span>
        <Button
          className="size-7"
          onClick={(event) => {
            event.stopPropagation();
            patchLayout({ minimized: !layout.minimized });
          }}
          onPointerDown={(event) => event.stopPropagation()}
          size="icon"
          type="button"
          variant="ghost"
        >
          {layout.minimized ? (
            <Maximize2 className="size-3.5" />
          ) : (
            <Minimize2 className="size-3.5" />
          )}
        </Button>
        <Button
          className="size-7"
          onClick={(event) => {
            event.stopPropagation();
            patchLayout({ open: false });
          }}
          onPointerDown={(event) => event.stopPropagation()}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X className="size-3.5" />
        </Button>
      </div>
      {layout.minimized ? null : (
        <Tabs className="flex min-h-0 flex-1 flex-col" defaultValue="timeline">
          <TabsList className="h-9 shrink-0 justify-start gap-0 rounded-none border-border/70 border-b bg-transparent px-1">
            <InspectorTab value="prompt">Prompt</InspectorTab>
            <InspectorTab value="timeline">
              Stream
              <TabCount>{host.messages.length}</TabCount>
              <TabCount muted>{events.length}</TabCount>
            </InspectorTab>
            <InspectorTab value="tools">
              Tools
              <TabCount>{toolCalls.length}</TabCount>
            </InspectorTab>
            <InspectorTab value="state">State</InspectorTab>
          </TabsList>
          <TabsContent
            className="m-0 min-h-0 flex-1 overflow-hidden"
            value="prompt"
          >
            <PromptPanel initialPrompt={initialPrompt} />
          </TabsContent>
          <TabsContent
            className="m-0 min-h-0 flex-1 overflow-hidden"
            value="timeline"
          >
            <TimelinePanel events={events} messages={host.messages} />
          </TabsContent>
          <TabsContent
            className="m-0 min-h-0 flex-1 overflow-hidden"
            value="tools"
          >
            <ToolsPanel toolCalls={toolCalls} />
          </TabsContent>
          <TabsContent
            className="m-0 min-h-0 flex-1 overflow-hidden"
            value="state"
          >
            <JsonPanel value={host.state} />
          </TabsContent>
          <footer className="shrink-0 border-border/60 border-t px-3 py-1.5">
            <p className="font-mono text-muted-foreground text-xxs">
              Real-time AG-UI debugging for Engenty copilot runs
            </p>
          </footer>
        </Tabs>
      )}
    </div>
  );
}

function InspectorTab({
  children,
  value,
}: {
  children: ReactNode;
  value: string;
}) {
  return (
    <TabsTrigger
      className="h-9 rounded-none border-0 border-transparent border-b-2 bg-transparent px-3 font-mono text-xs data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
      value={value}
    >
      {children}
    </TabsTrigger>
  );
}

function TabCount({ children, muted }: { children: number; muted?: boolean }) {
  if (children <= 0) {
    return null;
  }
  return (
    <Badge
      className={cn(
        "ml-1 h-4 min-w-4 px-1 font-mono text-[9px]",
        muted && "opacity-60"
      )}
      variant="secondary"
    >
      {children}
    </Badge>
  );
}
