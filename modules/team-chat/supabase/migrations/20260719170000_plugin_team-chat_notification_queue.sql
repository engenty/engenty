-- User notification fan-out queue (N1): consumed by apps/ai
-- (team-chat-notification-consumer) into the platform inbox.
-- pgmq.create is idempotent.
SELECT pgmq.create('team_chat_notification');
