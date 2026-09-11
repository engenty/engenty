/**
 * Drag a conversation row within its section, into another section, or into
 * Favoriten. One DndContext over the whole list; every section (and
 * Favoriten) is a droppable container holding a sortable list of row keys.
 *
 * Dropping decides the target by what the pointer is over: a row → that
 * row's container at that row's index; a container's own body (an empty
 * section, say) → the end of it.
 */
import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  type SortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@engenty/ui-core";
import type { ConversationNavItem } from "@engenty/user-settings";
import { type CSSProperties, type ReactNode, useId, useMemo } from "react";

const POINTER_DISTANCE_PX = 8;

export interface SpaceConversationDrop {
  fromContainer: string;
  item: ConversationNavItem;
  toContainer: string;
  /** Where in the target the row landed. */
  toIndex: number;
}

export function SpaceConversationDraggable({
  children,
  id,
}: {
  children: ReactNode;
  id: ConversationNavItem;
}) {
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id });
  const style: CSSProperties = {
    opacity: isDragging ? 0.55 : 1,
    position: "relative",
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 2 : undefined,
  };
  return (
    <div
      className={cn("touch-none", isDragging && "cursor-grabbing")}
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

/** A section's body: a droppable container with its rows as a sortable list. */
export function SpaceConversationDropZone({
  children,
  className,
  id,
  items,
  strategy = verticalListSortingStrategy,
}: {
  children: ReactNode;
  className?: string;
  id: string;
  items: readonly ConversationNavItem[];
  strategy?: SortingStrategy;
}) {
  const { isOver, setNodeRef } = useDroppable({ id });
  return (
    <SortableContext id={id} items={[...items]} strategy={strategy}>
      <div
        className={cn(
          className,
          isOver && items.length === 0 && "rounded-[8px] bg-muted/40"
        )}
        data-testid={`space-conversation-zone-${id}`}
        ref={setNodeRef}
      >
        {children}
      </div>
    </SortableContext>
  );
}

export function SpaceConversationDnd({
  children,
  containers,
  onDrop,
}: {
  children: ReactNode;
  /** Every container's rows, by container id — the lookup for a drop. */
  containers: ReadonlyMap<string, readonly ConversationNavItem[]>;
  onDrop: (drop: SpaceConversationDrop) => void;
}) {
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: POINTER_DISTANCE_PX },
    })
  );
  const containerOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const [containerId, items] of containers) {
      for (const item of items) {
        map.set(item, containerId);
      }
    }
    return map;
  }, [containers]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) {
      return;
    }
    const item = String(active.id) as ConversationNavItem;
    const overId = String(over.id);
    const fromContainer = containerOf.get(item);
    if (!fromContainer) {
      return;
    }
    const toContainer = containers.has(overId)
      ? overId
      : containerOf.get(overId);
    if (!toContainer) {
      return;
    }
    const targetItems = containers.get(toContainer) ?? [];
    const overIndex = targetItems.indexOf(overId as ConversationNavItem);
    const toIndex = overIndex >= 0 ? overIndex : targetItems.length;
    if (fromContainer === toContainer && overId === item) {
      return;
    }
    onDrop({ fromContainer, item, toContainer, toIndex });
  };

  return (
    <DndContext
      collisionDetection={closestCorners}
      id={dndId}
      onDragEnd={handleDragEnd}
      sensors={sensors}
    >
      {children}
    </DndContext>
  );
}
