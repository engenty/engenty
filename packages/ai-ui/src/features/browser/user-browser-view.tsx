/**
 * The live view of the person's own browser in a Space, with takeover
 * (PLAN-user-browser.md §2.5).
 *
 * One WebSocket, authorized by a ticket minted a moment ago. Frames arrive
 * as base64 JPEG strings and land on a canvas; JSON messages carry the page
 * URL, the viewport, the stream status and — ours — the seat and the tab
 * list. While the person holds the seat, pointer and keyboard events on the
 * canvas go to the page as CDP input and the tab strip and address bar are
 * live; while an agent holds it, the canvas only watches. What is typed
 * here is never echoed anywhere but the page.
 *
 * Inside the desk's browser pane the tab strip belongs to the pane's own top
 * bar (the artifact pane does the same with its chooser): pass `chromeSlot`
 * and the strip is portalled there, leaving the view itself borderless.
 */
import { useTranslation } from "@engenty/i18n/ui";
import { useMutation } from "@engenty/query-client";
import { Button, cn } from "@engenty/ui-core";
import {
  ArrowLeft,
  Globe,
  Hand,
  Lock,
  MousePointerClick,
  Pause,
  Plus,
  RotateCw,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  mintUserBrowserTicket,
  resolveUserBrowserWsUrl,
} from "./user-browser-api.js";

export type UserBrowserSeat = "agent" | "free" | "user";
type Seat = UserBrowserSeat;
interface TabInfo {
  active: boolean;
  index: number;
  title: string;
  url: string;
}
type StreamStatus =
  | "browser_closed"
  | "browser_starting"
  | "closed"
  | "connected"
  | "connecting"
  | "error"
  | "streaming";

// CDP modifier bits.
const MOD_ALT = 1;
const MOD_CTRL = 2;
const MOD_META = 4;
const MOD_SHIFT = 8;

/** What a tab chip says: the title, else the host, else "new tab". */
function tabLabel(tab: TabInfo, untitled: string): string {
  const title = tab.title.trim();
  if (title) {
    return title;
  }
  try {
    const parsed = new URL(tab.url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.host;
    }
  } catch {
    // Not a URL worth showing.
  }
  return untitled;
}

function modifiersOf(event: {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}): number {
  // CDP wants a bitmask; summing distinct powers of two is the same number.
  return (
    (event.altKey ? MOD_ALT : 0) +
    (event.ctrlKey ? MOD_CTRL : 0) +
    (event.metaKey ? MOD_META : 0) +
    (event.shiftKey ? MOD_SHIFT : 0)
  );
}

export function UserBrowserView({
  chromeSlot,
  className,
  onSeatChange,
  onStop,
  stopPending,
}: {
  /**
   * Pane top bar to put the tab strip in. Present = the view drops its own
   * card chrome and fills the pane edge to edge.
   */
  chromeSlot?: HTMLElement | null;
  className?: string;
  /** Who drives right now — the header badge mirrors it. */
  onSeatChange?: (seat: Seat) => void;
  /** Present = the toolbar carries a Stop (sleep) button. */
  onStop?: () => void;
  stopPending?: boolean;
}) {
  const { t } = useTranslation("ai-ui");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const viewportRef = useRef({ height: 720, width: 1280 });
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const [seat, setSeat] = useState<Seat>("free");
  const [url, setUrl] = useState("");
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  // The address bar shows the page's URL until the person starts editing.
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback((message: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }, []);

  const connect = useMutation({
    mutationFn: () => mintUserBrowserTicket(),
    onError: () => {
      setStatus("error");
      setError(t("browser.view.unavailable"));
    },
    onSuccess: (ticket) => {
      const socket = new WebSocket(resolveUserBrowserWsUrl(ticket.ws_url));
      socketRef.current = socket;
      socket.addEventListener("open", () => setStatus("connected"));
      socket.addEventListener("close", () => {
        if (socketRef.current === socket) {
          socketRef.current = null;
          setStatus((prev) => (prev === "error" ? prev : "closed"));
          setSeat("free");
        }
      });
      socket.addEventListener("message", (event) => {
        if (typeof event.data !== "string") {
          return;
        }
        const raw = event.data;
        if (raw.startsWith("{")) {
          try {
            const message = JSON.parse(raw) as {
              error?: string;
              message?: string;
              seat?: Seat;
              status?: StreamStatus;
              tabs?: TabInfo[];
              type?: string;
              url?: string;
              viewport?: { height: number; width: number };
            };
            if (message.type === "seat" && message.seat) {
              setSeat(message.seat);
              onSeatChange?.(message.seat);
            } else if (message.type === "tabs" && Array.isArray(message.tabs)) {
              setTabs(message.tabs);
              const active = message.tabs.find((tab) => tab.active);
              if (active) {
                setUrl(active.url);
              }
            } else if (typeof message.url === "string") {
              setUrl(message.url);
            } else if (message.viewport) {
              viewportRef.current = message.viewport;
              const canvas = canvasRef.current;
              if (canvas) {
                canvas.width = message.viewport.width;
                canvas.height = message.viewport.height;
              }
            } else if (message.status) {
              setStatus(message.status);
            } else if (message.error) {
              setStatus("error");
              setError(message.message ?? message.error);
            }
          } catch {
            // Not JSON after all: nothing to do with it.
          }
          return;
        }
        // A frame: base64 JPEG, drawn as it lands.
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!(canvas && context)) {
          return;
        }
        const image = new Image();
        image.onload = () => {
          if (canvas.width !== image.width || canvas.height !== image.height) {
            canvas.width = image.width;
            canvas.height = image.height;
          }
          context.drawImage(image, 0, 0);
        };
        image.src = `data:image/jpeg;base64,${raw}`;
      });
    },
  });
  const connectMutate = connect.mutate;

  useEffect(() => {
    connectMutate();
    return () => {
      const socket = socketRef.current;
      socketRef.current = null;
      socket?.close();
    };
  }, [connectMutate]);

  // The page takes the size of the box it is shown in, so frames map 1:1
  // onto the canvas — a real resolution, not a thumbnail. Re-sent whenever
  // the box changes (pane resize, split, expand) and once the stream is up.
  const requestViewport = useCallback(() => {
    const box = boxRef.current;
    if (!box) {
      return;
    }
    const width = Math.floor(box.clientWidth);
    const height = Math.floor(box.clientHeight);
    if (width > 0 && height > 0) {
      send({ height, type: "viewport", width });
    }
  }, [send]);
  useEffect(() => {
    const box = boxRef.current;
    if (!box) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver(() => {
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(requestViewport, 250);
    });
    observer.observe(box);
    return () => {
      observer.disconnect();
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [requestViewport]);
  useEffect(() => {
    if (status === "streaming" || status === "connected") {
      requestViewport();
    }
  }, [requestViewport, status]);

  // Canvas CSS pixels → page CSS pixels: the canvas is scaled to fit.
  const pagePoint = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.round(((event.clientX - rect.left) / rect.width) * canvas.width),
      y: Math.round(((event.clientY - rect.top) / rect.height) * canvas.height),
    };
  };
  const holding = seat === "user";
  const mouse = (
    eventType: "mouseMoved" | "mousePressed" | "mouseReleased",
    event: React.MouseEvent<HTMLCanvasElement>
  ) => {
    if (!holding) {
      return;
    }
    const button =
      event.button === 2 ? "right" : event.button === 1 ? "middle" : "left";
    send({
      button: eventType === "mouseMoved" ? "none" : button,
      clickCount: eventType === "mouseMoved" ? 0 : event.detail || 1,
      eventType,
      modifiers: modifiersOf(event),
      type: "mouse",
      ...pagePoint(event),
    });
  };

  const canDrive = status !== "error" && status !== "closed";
  const tabAction = (action: "close" | "new" | "switch", index?: number) => {
    if (!holding) {
      return;
    }
    send({ action, type: "tabs", ...(index === undefined ? {} : { index }) });
  };
  const navAction = (action: "back" | "reload") => {
    if (holding) {
      send({ action, type: "nav" });
    }
  };
  const secure = url.startsWith("https://");
  const seatDot =
    seat === "user"
      ? "bg-emerald-500"
      : seat === "agent"
        ? "bg-amber-500"
        : "bg-muted-foreground/40";

  const embedded = Boolean(chromeSlot);

  // The tabs: chips in the pane's top bar when embedded, otherwise a strip
  // above the toolbar. Switching, opening and closing need the seat, like
  // any other input.
  const tabStrip = (
    <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
      {tabs.map((tab) => (
        <div
          className={cn(
            "group flex h-7 min-w-0 max-w-[12rem] flex-1 items-center gap-1.5 rounded-md px-2 text-xs",
            tab.active
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-accent/60"
          )}
          key={tab.index}
        >
          <Globe
            aria-hidden
            className="size-3.5 shrink-0 text-muted-foreground"
          />
          <button
            className="min-w-0 flex-1 truncate text-left disabled:cursor-default"
            disabled={!holding || tab.active}
            onClick={() => tabAction("switch", tab.index)}
            title={tab.url}
            type="button"
          >
            {tabLabel(tab, t("browser.view.tabs.untitled"))}
          </button>
          {holding && tabs.length > 1 ? (
            <button
              aria-label={t("browser.view.tabs.close")}
              className="shrink-0 rounded-sm p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
              onClick={() => tabAction("close", tab.index)}
              type="button"
            >
              <X aria-hidden className="size-3" />
            </button>
          ) : null}
        </div>
      ))}
      {holding ? (
        <Button
          aria-label={t("browser.view.tabs.new")}
          className="size-7 shrink-0"
          onClick={() => tabAction("new")}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Plus aria-hidden className="size-3.5" />
        </Button>
      ) : null}
    </div>
  );

  // Toolbar: back, reload, the address pill (with who drives), take over /
  // hand back, stop.
  const toolbar = (
    <div
      className={cn(
        "flex h-10 shrink-0 items-center gap-1 bg-background px-1.5",
        embedded ? "border-border-soft border-b" : "border-t"
      )}
    >
      <Button
        aria-label={t("browser.view.back")}
        className="size-7 shrink-0"
        disabled={!holding}
        onClick={() => navAction("back")}
        size="icon"
        type="button"
        variant="ghost"
      >
        <ArrowLeft aria-hidden className="size-4" />
      </Button>
      <Button
        aria-label={t("browser.view.reload")}
        className="size-7 shrink-0"
        disabled={!holding}
        onClick={() => navAction("reload")}
        size="icon"
        type="button"
        variant="ghost"
      >
        <RotateCw aria-hidden className="size-3.5" />
      </Button>
      <form
        className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 focus-within:border-ring focus-within:bg-background"
        onSubmit={(event) => {
          event.preventDefault();
          const next = (draft ?? "").trim();
          if (holding && next) {
            send({ type: "navigate", url: next });
            setDraft(null);
          }
        }}
      >
        {secure ? (
          <Lock aria-hidden className="size-3 shrink-0 text-muted-foreground" />
        ) : (
          <Globe
            aria-hidden
            className="size-3 shrink-0 text-muted-foreground"
          />
        )}
        <input
          aria-label={t("browser.view.address")}
          className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground disabled:cursor-default"
          disabled={!holding}
          onBlur={() => setDraft(null)}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={(event) => {
            setDraft(url);
            event.currentTarget.select();
          }}
          placeholder={t("browser.view.address")}
          spellCheck={false}
          value={draft ?? url}
        />
        <span
          className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground"
          title={t(`browser.view.seat.${seat}`)}
        >
          <span aria-hidden className={cn("size-1.5 rounded-full", seatDot)} />
          <span className="hidden md:inline">
            {t(`browser.view.seat.${seat}`)}
          </span>
        </span>
      </form>
      <Button
        className="h-7 shrink-0 rounded-full px-3 text-xs"
        disabled={!canDrive}
        onClick={() =>
          send({ action: holding ? "release" : "take", type: "seat" })
        }
        size="sm"
        variant={holding ? "default" : "secondary"}
      >
        {holding ? (
          <Hand aria-hidden className="mr-1 size-3.5" />
        ) : (
          <MousePointerClick aria-hidden className="mr-1 size-3.5" />
        )}
        {holding ? t("browser.view.handBack") : t("browser.view.takeOver")}
      </Button>
      {onStop ? (
        <Button
          aria-label={t("browser.panel.stop")}
          className="size-7 shrink-0"
          disabled={stopPending}
          onClick={onStop}
          size="icon"
          title={t("browser.panel.stop")}
          type="button"
          variant="ghost"
        >
          <Pause aria-hidden className="size-3.5" />
        </Button>
      ) : null}
    </div>
  );

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {chromeSlot ? createPortal(tabStrip, chromeSlot) : null}
      {embedded ? (
        toolbar
      ) : (
        /* Browser chrome: a tab strip on top of a toolbar, one surface. */
        <div className="rounded-t-lg border border-b-0 bg-muted/40">
          <div className="flex min-w-0 items-center px-1.5 pt-1.5">
            {tabStrip}
          </div>
          {toolbar}
        </div>
      )}
      {/* The page, scaled to whatever height the pane leaves — never taller
          than its own aspect ratio allows, letterboxed on black. */}
      <div
        className={cn(
          "relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black",
          embedded ? null : "rounded-b-lg border"
        )}
        ref={boxRef}
      >
        <canvas
          className={cn(
            "block max-h-full max-w-full",
            holding ? "cursor-default" : "cursor-not-allowed"
          )}
          height={viewportRef.current.height}
          onContextMenu={(event) => event.preventDefault()}
          onKeyDown={(event) => {
            if (!holding) {
              return;
            }
            event.preventDefault();
            send({
              code: event.code,
              eventType: "keyDown",
              key: event.key,
              modifiers: modifiersOf(event),
              type: "keyboard",
            });
            if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
              send({ eventType: "char", text: event.key, type: "keyboard" });
            }
          }}
          onKeyUp={(event) => {
            if (!holding) {
              return;
            }
            event.preventDefault();
            send({
              code: event.code,
              eventType: "keyUp",
              key: event.key,
              modifiers: modifiersOf(event),
              type: "keyboard",
            });
          }}
          onMouseDown={(event) => {
            event.currentTarget.focus();
            mouse("mousePressed", event);
          }}
          onMouseMove={(event) => mouse("mouseMoved", event)}
          onMouseUp={(event) => mouse("mouseReleased", event)}
          onWheel={(event) => {
            if (!holding) {
              return;
            }
            send({
              button: "none",
              deltaX: Math.round(event.deltaX),
              deltaY: Math.round(event.deltaY),
              eventType: "mouseWheel",
              modifiers: modifiersOf(event),
              type: "mouse",
              ...pagePoint(event),
            });
          }}
          ref={canvasRef}
          tabIndex={0}
          width={viewportRef.current.width}
        />
        {status === "streaming" ? null : (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70 text-muted-foreground text-sm">
            {error ?? t(`browser.view.status.${status}`)}
          </div>
        )}
      </div>
    </div>
  );
}
