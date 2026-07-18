"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, cn } from "@engenty/ui-core";
import {
  GripVerticalIcon,
  PencilIcon,
  SendIcon,
  Trash2Icon,
} from "lucide-react";
import type { QueuedCopilotMessage } from "../../../copilot/use-copilot-message-queue";

export interface CopilotMessageQueueSurfaceLabels {
  /** Aria label for the drag handle. */
  drag: string;
  /** Label/aria for the "edit" control (removes + loads into composer). */
  edit: string;
  /** Aria label for the "remove" control. */
  remove: string;
  /** Label/aria for the "send now" control. */
  sendNow: string;
  /** Heading shown above the queued list. */
  title: string;
}

export interface CopilotMessageQueueSurfaceProps {
  className?: string;
  labels: CopilotMessageQueueSurfaceLabels;
  /** Remove the message from the queue and load its text into the composer. */
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  /** Move `fromId` to `toId`'s position (drag-and-drop reorder). */
  onReorder: (fromId: string, toId: string) => void;
  onSendNow: (id: string) => void;
  queued: QueuedCopilotMessage[];
}

function QueuedRow({
  labels,
  message,
  onEdit,
  onRemove,
  onSendNow,
}: {
  labels: CopilotMessageQueueSurfaceLabels;
  message: QueuedCopilotMessage;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  onSendNow: (id: string) => void;
}) {
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: message.id });
  return (
    <li
      className={cn(
        "flex items-center gap-1 rounded-md bg-background/70 px-1.5 py-1"
      )}
      ref={setNodeRef}
      style={{
        opacity: isDragging ? 0.5 : 1,
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <button
        aria-label={labels.drag}
        className="flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/60 hover:bg-muted active:cursor-grabbing"
        type="button"
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon className="size-4" />
      </button>
      <span className="min-w-0 flex-1 truncate" title={message.text}>
        {message.text}
      </span>
      <Button
        aria-label={labels.edit}
        onClick={() => onEdit(message.id)}
        size="icon-sm"
        title={labels.edit}
        type="button"
        variant="ghost"
      >
        <PencilIcon className="size-3.5" />
      </Button>
      <Button
        aria-label={labels.sendNow}
        onClick={() => onSendNow(message.id)}
        size="icon-sm"
        title={labels.sendNow}
        type="button"
        variant="ghost"
      >
        <SendIcon className="size-3.5" />
      </Button>
      <Button
        aria-label={labels.remove}
        className="text-muted-foreground hover:text-destructive"
        onClick={() => onRemove(message.id)}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <Trash2Icon className="size-3.5" />
      </Button>
    </li>
  );
}

/**
 * Shows the client-side message queue above the composer: messages typed while a
 * run was in flight, each draggable to reorder (grip handle, left — @dnd-kit, so
 * pointer/touch/keyboard all work), editable (pen → removes + loads into the
 * composer), deletable, and sendable-now (stop current + send). Display-only; queue
 * state + auto-drain live in `useCopilotMessageQueue`.
 */
export function CopilotMessageQueueSurface({
  className,
  labels,
  onEdit,
  onRemove,
  onReorder,
  onSendNow,
  queued,
}: CopilotMessageQueueSurfaceProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorder(String(active.id), String(over.id));
    }
  };

  if (queued.length === 0) {
    return null;
  }
  return (
    // Chrome-less: rendered inside the composer dock flap, which provides the
    // card background and border — no box of its own.
    <div className={cn("text-sm", className)}>
      <div className="mb-1.5 px-1 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
        {labels.title} · {queued.length}
      </div>
      <DndContext
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        sensors={sensors}
      >
        <SortableContext
          items={queued.map((m) => m.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="flex flex-col gap-1">
            {queued.map((message) => (
              <QueuedRow
                key={message.id}
                labels={labels}
                message={message}
                onEdit={onEdit}
                onRemove={onRemove}
                onSendNow={onSendNow}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}
