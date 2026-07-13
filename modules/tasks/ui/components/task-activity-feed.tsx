import { useTranslation } from "@engenty/i18n/ui";
import {
  Avatar,
  AvatarFallback,
  Badge,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
} from "@engenty/ui-core";
import { Bot, ChevronRight } from "lucide-react";
import type {
  TaskActivity,
  TaskStatusDefinition,
} from "../../src/schema/types.js";
import {
  buildActivityMessage,
  formatActivityPayload,
  hasExpandableActivityPayload,
  resolveActivityActor,
  truncateCommentPreview,
} from "../lib/format-activity.js";
import { formatActivityTimeLabel } from "../lib/format-activity-time.js";
import { TASK_STATUS_FILLS } from "../lib/task-status-styles.js";
import { TaskStatusBadge } from "./task-status-badge.js";

/** Avatar uses `size-7`; row text/pills share this cross-axis rhythm for optical alignment. */
export const ACTIVITY_ROW_SHELL_CLASS =
  "flex gap-2.5 @min-[26rem]:items-center items-start";
export const ACTIVITY_ROW_WIDE_CLASS =
  "@min-[26rem]:flex hidden @min-[26rem]:min-h-7 @min-[26rem]:min-w-0 @min-[26rem]:flex-wrap @min-[26rem]:items-center @min-[26rem]:gap-x-1.5 @min-[26rem]:gap-y-1";
export const ACTIVITY_ROW_NAME_CLASS =
  "inline-flex min-h-7 shrink-0 items-center font-semibold text-foreground text-sm leading-none";
export const ACTIVITY_ROW_TEXT_CLASS =
  "inline-flex min-h-7 shrink-0 items-center text-muted-foreground text-sm leading-none";
export const ACTIVITY_ROW_TIME_CLASS =
  "ml-auto inline-flex min-h-7 shrink-0 items-center text-muted-foreground text-xs leading-none";

interface TaskActivityListProps {
  activity: TaskActivity[];
  assigneeProfiles?: Map<string, { full_name: string; id: string }>;
  statusDefinitions?: TaskStatusDefinition[];
}

function ActivityStatusInline({
  status,
  definitions,
}: {
  definitions: TaskStatusDefinition[];
  status: string;
}) {
  return <TaskStatusBadge compact definitions={definitions} status={status} />;
}

export function ActivityActorAvatar({
  actor,
}: {
  actor: ReturnType<typeof resolveActivityActor>;
}) {
  const fillClass = TASK_STATUS_FILLS[actor.colorKey] ?? TASK_STATUS_FILLS.blue;

  return (
    <Avatar className="size-7" size="sm">
      <AvatarFallback
        className={cn(
          "text-white text-xxs",
          actor.kind === "agent" ? "bg-violet-500" : fillClass
        )}
      >
        {actor.kind === "agent" ? (
          <Bot aria-hidden className="size-3.5" />
        ) : (
          actor.initials
        )}
      </AvatarFallback>
    </Avatar>
  );
}

export function ActivityCommentLine({
  actionLabel,
  preview,
}: {
  actionLabel: string;
  preview?: string;
}) {
  const trimmedPreview = preview?.trim();
  const snippet = trimmedPreview
    ? truncateCommentPreview(trimmedPreview)
    : null;

  return (
    <span
      className={cn(
        "flex min-h-7 min-w-0 items-center gap-x-1.5 text-muted-foreground text-sm leading-none"
      )}
    >
      <span className="inline-flex shrink-0 items-center">{actionLabel}</span>
      {snippet ? (
        <span
          className="inline-flex min-w-0 items-center truncate text-foreground/70"
          title={trimmedPreview}
        >
          {snippet}
        </span>
      ) : null}
    </span>
  );
}

function ActivityStatusChangeLine({
  definitions,
  message,
  t,
}: {
  definitions: TaskStatusDefinition[];
  message: ReturnType<typeof buildActivityMessage>;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  if (
    message.kind !== "status_changed" ||
    !message.statusFrom ||
    !message.statusTo
  ) {
    return null;
  }

  return (
    <p className="flex min-h-7 min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-muted-foreground text-sm leading-none">
      <span className={ACTIVITY_ROW_TEXT_CLASS}>
        {t("detail.activityActorStatusChangedPrefix")}
      </span>
      <ActivityStatusInline
        definitions={definitions}
        status={message.statusFrom}
      />
      <span className={ACTIVITY_ROW_TEXT_CLASS}>
        {t("detail.activityActorStatusChangedMiddle")}
      </span>
      <ActivityStatusInline
        definitions={definitions}
        status={message.statusTo}
      />
    </p>
  );
}

function ActivityMessageBody({
  definitions,
  message,
  t,
}: {
  definitions: TaskStatusDefinition[];
  message: ReturnType<typeof buildActivityMessage>;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  if (
    message.kind === "status_changed" &&
    message.statusFrom &&
    message.statusTo
  ) {
    return (
      <ActivityStatusChangeLine
        definitions={definitions}
        message={message}
        t={t}
      />
    );
  }

  if (message.kind === "assignee_changed" && message.textValues) {
    return (
      <span className={ACTIVITY_ROW_TEXT_CLASS}>
        {t(message.textKey, message.textValues)}
      </span>
    );
  }

  if (message.kind === "comment_added") {
    return (
      <ActivityCommentLine
        actionLabel={t(message.textKey, message.textValues)}
        preview={message.commentPreview}
      />
    );
  }

  return (
    <span className={ACTIVITY_ROW_TEXT_CLASS}>
      {t(message.textKey, message.textValues)}
    </span>
  );
}

export function TaskActivityRow({
  item,
  assigneeProfiles,
  statusDefinitions,
}: {
  assigneeProfiles?: Map<string, { full_name: string; id: string }>;
  item: TaskActivity;
  statusDefinitions: TaskStatusDefinition[];
}) {
  const { t } = useTranslation("tasks");
  const actor = resolveActivityActor(item, assigneeProfiles, t);
  const message = buildActivityMessage(item, {
    assigneeProfiles,
    statusDefinitions,
    t,
  });
  const expandable = hasExpandableActivityPayload(item);
  const timeLabel = formatActivityTimeLabel(item.created_at, t);

  const statusChangeLine =
    message.kind === "status_changed" &&
    message.statusFrom &&
    message.statusTo ? (
      <ActivityStatusChangeLine
        definitions={statusDefinitions}
        message={message}
        t={t}
      />
    ) : null;

  const commentLine =
    message.kind === "comment_added" ? (
      <ActivityCommentLine
        actionLabel={t(message.textKey, message.textValues)}
        preview={message.commentPreview}
      />
    ) : null;

  const actionBody =
    statusChangeLine === null && commentLine === null ? (
      <ActivityMessageBody
        definitions={statusDefinitions}
        message={message}
        t={t}
      />
    ) : null;

  return (
    <li className="@container ui-canvas-raised rounded-md bg-card px-3 py-2.5">
      <div className={ACTIVITY_ROW_SHELL_CLASS}>
        <ActivityActorAvatar actor={actor} />

        <div className="min-w-0 flex-1">
          {/* Wide: actor + action + time on one line (wraps only when container is tight) */}
          <div className={ACTIVITY_ROW_WIDE_CLASS}>
            <span className={ACTIVITY_ROW_NAME_CLASS}>{actor.label}</span>
            {actor.kind === "agent" ? (
              <Badge
                className="inline-flex min-h-7 shrink-0 items-center font-normal text-xxs leading-none"
                variant="secondary"
              >
                {t("detail.activityAgentBadge")}
              </Badge>
            ) : null}
            {statusChangeLine ? (
              <div className="flex min-h-7 min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
                <span className={ACTIVITY_ROW_TEXT_CLASS}>
                  {t("detail.activityActorStatusChangedPrefix")}
                </span>
                <ActivityStatusInline
                  definitions={statusDefinitions}
                  status={message.statusFrom ?? ""}
                />
                <span className={ACTIVITY_ROW_TEXT_CLASS}>
                  {t("detail.activityActorStatusChangedMiddle")}
                </span>
                <ActivityStatusInline
                  definitions={statusDefinitions}
                  status={message.statusTo ?? ""}
                />
              </div>
            ) : commentLine ? (
              <div className="min-w-0 flex-1">{commentLine}</div>
            ) : (
              <div className="min-w-0">{actionBody}</div>
            )}
            <time
              className={ACTIVITY_ROW_TIME_CLASS}
              dateTime={item.created_at}
              title={new Date(item.created_at).toLocaleString()}
            >
              {timeLabel}
            </time>
          </div>

          {/* Narrow: name + time, then action on second line */}
          <div className="@min-[26rem]:hidden space-y-1">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5">
                <span className="font-semibold text-foreground text-sm leading-snug">
                  {actor.label}
                </span>
                {actor.kind === "agent" ? (
                  <Badge className="font-normal text-xxs" variant="secondary">
                    {t("detail.activityAgentBadge")}
                  </Badge>
                ) : null}
              </div>
              <time
                className="shrink-0 text-muted-foreground text-xs"
                dateTime={item.created_at}
                title={new Date(item.created_at).toLocaleString()}
              >
                {timeLabel}
              </time>
            </div>
            {statusChangeLine ?? commentLine ?? actionBody}
          </div>

          {expandable ? (
            <Collapsible>
              <CollapsibleTrigger className="group/trigger flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground">
                <ChevronRight className="size-3.5 transition-transform group-data-[state=open]/trigger:rotate-90" />
                {t("detail.activityViewDetails")}
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-1.5">
                <pre className="max-h-40 overflow-auto rounded-md bg-muted/40 p-2 font-mono text-[11px] text-muted-foreground">
                  {formatActivityPayload(item)}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function TaskActivityList({
  activity,
  assigneeProfiles,
  statusDefinitions = [],
}: TaskActivityListProps) {
  const { t } = useTranslation("tasks");

  if (activity.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">{t("detail.noActivity")}</p>
    );
  }

  return (
    <ul className="space-y-2">
      {activity.map((item) => (
        <TaskActivityRow
          assigneeProfiles={assigneeProfiles}
          item={item}
          key={item.id}
          statusDefinitions={statusDefinitions}
        />
      ))}
    </ul>
  );
}

/** Standalone activity section (legacy); prefer TaskCommentsActivityTabs on detail. */
export function TaskActivityFeed({
  activity,
  assigneeProfiles,
  statusDefinitions = [],
}: TaskActivityListProps) {
  const { t } = useTranslation("tasks");

  return (
    <section className="space-y-2">
      <h2 className="font-medium text-sm">{t("detail.activity")}</h2>
      <TaskActivityList
        activity={activity}
        assigneeProfiles={assigneeProfiles}
        statusDefinitions={statusDefinitions}
      />
    </section>
  );
}
