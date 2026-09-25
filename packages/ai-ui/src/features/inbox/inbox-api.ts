// The inbox moved to @engenty/notifications-ui; these names stay for the
// modules that embed it through `@engenty/ai-ui/embed`.
export {
  type AttentionCountDto as InboxAttentionCountDto,
  fetchAttentionCount as fetchInboxAttentionCount,
  type ListNotificationsInput as ListInboxInput,
  listNotifications as listInbox,
  markAllSeen as markAllInboxSeen,
  markNotification as markInboxNotification,
  type NotificationDto as InboxNotificationDto,
} from "@engenty/notifications-ui";
