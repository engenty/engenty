import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@engenty/ui-core";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { NavigationItem } from "../types/shell";

const LONG_PRESS_MS = 480;
const MOVE_CANCEL_PX = 8;

const WOBBLE_STYLE = `
@keyframes engenty-dock-wobble {
  0% { transform: rotate(-5deg) scale(1.04); }
  25% { transform: rotate(4.5deg) scale(1.02); }
  50% { transform: rotate(-4.5deg) scale(1.04); }
  75% { transform: rotate(5deg) scale(1.02); }
  100% { transform: rotate(-5deg) scale(1.04); }
}
.engenty-dock-wobble {
  animation: engenty-dock-wobble 0.55s ease-in-out infinite;
  transform-origin: 50% 60%;
}
`;

function SortableModuleSlot({
  id,
  wobbleDelayMs,
  children,
}: {
  children: ReactNode;
  id: string;
  wobbleDelayMs: number;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
    position: "relative",
    zIndex: isDragging ? 2 : undefined,
  };

  return (
    <div
      className={cn("touch-none", isDragging && "cursor-grabbing")}
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClickCapture={(event) => {
        // Rearrange mode — never navigate.
        event.preventDefault();
        event.stopPropagation();
      }}
      onDragStartCapture={(event) => {
        event.preventDefault();
      }}
    >
      <div
        className={cn(!isDragging && "engenty-dock-wobble")}
        style={{ animationDelay: `${wobbleDelayMs}ms` }}
      >
        {children}
      </div>
    </div>
  );
}

function LongPressGate({
  onLongPress,
  children,
}: {
  children: ReactNode;
  onLongPress: () => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const activatedRef = useRef(false);

  function clearTimer() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
  }

  return (
    <div
      className="touch-none"
      onClickCapture={(event) => {
        if (activatedRef.current) {
          event.preventDefault();
          event.stopPropagation();
          activatedRef.current = false;
        }
      }}
      onContextMenu={(event) => {
        if (timerRef.current || activatedRef.current) {
          event.preventDefault();
        }
      }}
      onPointerCancel={clearTimer}
      onPointerDown={(event) => {
        if (event.button !== 0) {
          return;
        }
        activatedRef.current = false;
        startRef.current = { x: event.clientX, y: event.clientY };
        clearTimer();
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          activatedRef.current = true;
          onLongPress();
        }, LONG_PRESS_MS);
      }}
      onPointerLeave={clearTimer}
      onPointerMove={(event) => {
        if (!(startRef.current && timerRef.current)) {
          return;
        }
        const dx = event.clientX - startRef.current.x;
        const dy = event.clientY - startRef.current.y;
        if (dx * dx + dy * dy > MOVE_CANCEL_PX * MOVE_CANCEL_PX) {
          clearTimer();
        }
      }}
      onPointerUp={clearTimer}
    >
      {children}
    </div>
  );
}

function idsFromItems(list: NavigationItem[]): string[] {
  return list
    .map((item) => item.id)
    .filter((id): id is string => typeof id === "string");
}

export interface SortableModulesRailProps {
  items: NavigationItem[];
  /** Persist when rearrange mode ends (outside click / Escape). */
  onReorder: (orderedIds: string[]) => void;
  renderItem: (
    item: NavigationItem,
    state: { rearranging: boolean }
  ) => ReactNode;
}

/**
 * Modules rail with opt-in rearrange mode:
 * long-press → wobble + drag; click outside / Escape → persist + exit.
 * Normal clicks navigate; dnd-kit listeners are not mounted until rearrange.
 */
export function SortableModulesRail({
  items,
  onReorder,
  renderItem,
}: SortableModulesRailProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const styleId = useId();
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

  const [rearrangeMode, setRearrangeMode] = useState(false);
  const [orderedItems, setOrderedItems] = useState(items);
  const orderedItemsRef = useRef(orderedItems);
  orderedItemsRef.current = orderedItems;

  const sortableIds = idsFromItems(orderedItems);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    })
  );

  // Sync from props when not rearranging (e.g. after persist / tenant switch).
  useEffect(() => {
    if (!rearrangeMode) {
      setOrderedItems(items);
    }
  }, [items, rearrangeMode]);

  function enterRearrangeMode() {
    setOrderedItems(items);
    setRearrangeMode(true);
  }

  function persistAndExit() {
    const order = idsFromItems(orderedItemsRef.current);
    if (order.length > 0) {
      onReorderRef.current(order);
    }
    setRearrangeMode(false);
  }

  // Outside pointer / Escape ends rearrange and persists.
  useEffect(() => {
    if (!rearrangeMode) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      const root = rootRef.current;
      if (!root) {
        return;
      }
      if (event.target instanceof Node && root.contains(event.target)) {
        return;
      }
      persistAndExit();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        persistAndExit();
      }
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [rearrangeMode]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const oldIndex = sortableIds.indexOf(String(active.id));
    const newIndex = sortableIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) {
      return;
    }
    setOrderedItems((prev) => {
      const ids = idsFromItems(prev);
      const nextIds = arrayMove(ids, oldIndex, newIndex);
      const byId = new Map(
        prev.filter((item) => item.id).map((item) => [item.id as string, item])
      );
      const next: NavigationItem[] = [];
      for (const id of nextIds) {
        const item = byId.get(id);
        if (item) {
          next.push(item);
        }
      }
      for (const item of prev) {
        if (!item.id) {
          next.push(item);
        }
      }
      return next;
    });
  }

  if (idsFromItems(items).length < 2 && !rearrangeMode) {
    return (
      <div className="space-y-1">
        {items.map((item) => (
          <div key={item.id ?? item.to}>
            {renderItem(item, { rearranging: false })}
          </div>
        ))}
      </div>
    );
  }

  if (!rearrangeMode) {
    return (
      <div className="space-y-1" ref={rootRef}>
        {items.map((item) => (
          <LongPressGate
            key={item.id ?? item.to}
            onLongPress={enterRearrangeMode}
          >
            {renderItem(item, { rearranging: false })}
          </LongPressGate>
        ))}
      </div>
    );
  }

  return (
    <div
      aria-label="Rearrange modules"
      className="space-y-1"
      ref={rootRef}
      role="group"
    >
      <style id={styleId}>{WOBBLE_STYLE}</style>
      <DndContext
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        sensors={sensors}
      >
        <SortableContext
          items={sortableIds}
          strategy={verticalListSortingStrategy}
        >
          {orderedItems.map((item, index) => {
            const key = item.id ?? item.to;
            // Inert tiles: no <a>/<Link> in the DOM while rearranging.
            const tile = renderItem(item, { rearranging: true });
            if (!item.id) {
              return <div key={key}>{tile}</div>;
            }
            return (
              <SortableModuleSlot
                id={item.id}
                key={key}
                wobbleDelayMs={-((index % 5) * 35)}
              >
                {tile}
              </SortableModuleSlot>
            );
          })}
        </SortableContext>
      </DndContext>
    </div>
  );
}
