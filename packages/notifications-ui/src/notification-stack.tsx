// Cards stacked like macOS groups a Notification Center by app: one stack
// per agent (`stackKeyOf`), newest on top. A collapsed stack shows its newest
// card with the rest peeking out under it — no "+N" line, the sheets say it;
// a click, or resting the pointer on it for a few seconds, opens it in place.
// An open stack is just its cards — no controls row that would read as a
// section break; the section heading folds every stack again.
import {
  LayoutGroup,
  MotionConfig,
  motion,
  type Transition,
} from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import type { NotificationDto } from "./api.js";
import { groupIntoStacks } from "./classification.js";
import { NotificationCard } from "./notification-card.js";

/** Open and fold like macOS: the peeking sheets grow into the cards. */
const STACK_TRANSITION: Transition = {
  bounce: 0,
  duration: 0.35,
  type: "spring",
};

/** How long the pointer rests on a collapsed stack before it opens. */
const HOVER_OPEN_MS = 3000;

export interface NotificationStacksProps {
  /** Opens (true) or folds (false) every stack when it changes. */
  expanded?: boolean;
  /** `agent`: one stack per agent. `one`: everything in one stack. */
  groupBy?: "agent" | "one";
  locale: string;
  notifications: NotificationDto[];
  onNavigate?: () => void;
  /** Whether a card names its space (the viewer stands elsewhere). */
  showSpace?: (notification: NotificationDto) => boolean;
  variant?: "list" | "page";
}

export function NotificationStacks({
  expanded,
  groupBy = "agent",
  locale,
  notifications,
  onNavigate,
  showSpace,
  variant = "list",
}: NotificationStacksProps) {
  const groups =
    groupBy === "one"
      ? notifications.length > 0
        ? [{ items: notifications, key: "one" }]
        : []
      : groupIntoStacks(notifications);
  return (
    <MotionConfig reducedMotion="user" transition={STACK_TRANSITION}>
      <ul className="flex flex-col gap-2">
        {groups.map((group) => (
          <motion.li key={group.key} layout="position">
            <NotificationStack
              expanded={expanded}
              items={group.items}
              locale={locale}
              onNavigate={onNavigate}
              showSpace={showSpace}
              variant={variant}
            />
          </motion.li>
        ))}
      </ul>
    </MotionConfig>
  );
}

function NotificationStack({
  expanded,
  items,
  locale,
  onNavigate,
  showSpace,
  variant,
}: {
  expanded?: boolean;
  items: NotificationDto[];
  locale: string;
  onNavigate?: () => void;
  showSpace?: (notification: NotificationDto) => boolean;
  variant: "list" | "page";
}) {
  const [open, setOpen] = useState(false);
  const groupId = useId();
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelHover = () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };
  const startHover = () => {
    cancelHover();
    hoverTimer.current = setTimeout(() => setOpen(true), HOVER_OPEN_MS);
  };
  useEffect(() => cancelHover, []);
  useEffect(() => {
    if (expanded !== undefined) {
      setOpen(expanded);
    }
  }, [expanded]);
  const [head, ...rest] = items;
  if (!head) {
    return null;
  }
  const card = (notification: NotificationDto, onActivate?: () => void) => (
    <NotificationCard
      key={notification.id}
      locale={locale}
      notification={notification}
      onActivate={onActivate}
      onNavigate={onNavigate}
      showSpace={showSpace?.(notification) ?? false}
      variant={variant}
    />
  );
  if (rest.length === 0) {
    return card(head);
  }

  const [second, third] = rest;
  if (!open) {
    return (
      <LayoutGroup id={groupId}>
        <div
          className="isolate flex flex-col"
          onPointerEnter={startHover}
          onPointerLeave={cancelHover}
        >
          <motion.div className="relative z-20" layoutId={head.id}>
            {card(head, () => setOpen(true))}
          </motion.div>
          {/* The rest, peeking out under the newest card. */}
          {second ? (
            <motion.span
              aria-hidden
              className="ui-card-raised relative z-10 mx-2.5 -mt-2 h-4"
              layoutId={second.id}
            />
          ) : null}
          {third ? (
            <motion.span
              aria-hidden
              className="ui-card-raised relative z-0 mx-5 -mt-3 h-4 opacity-70"
              layoutId={third.id}
            />
          ) : null}
        </div>
      </LayoutGroup>
    );
  }

  return (
    <LayoutGroup id={groupId}>
      <ul className="flex flex-col gap-2">
        {items.map((notification, index) => (
          <motion.li
            animate={{ opacity: 1, y: 0 }}
            // Past the two peeking sheets there is nothing to grow from.
            initial={index > 2 ? { opacity: 0, y: -8 } : false}
            key={notification.id}
            layoutId={notification.id}
          >
            <motion.div
              animate={{ opacity: 1 }}
              initial={index === 0 ? false : { opacity: 0 }}
            >
              {card(notification)}
            </motion.div>
          </motion.li>
        ))}
      </ul>
    </LayoutGroup>
  );
}
