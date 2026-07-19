-- Agent mention dispatch queue (Phase 3): consumed by apps/ai
-- (team-chat-mention-consumer). pgmq.create is idempotent.
SELECT pgmq.create('team_chat_agent_mention');
