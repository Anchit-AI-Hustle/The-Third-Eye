-- Assistant chats sync into the Task Tracker (lib/chatTasks.ts): how many
-- messages have been read, when, and which task the chat is filed under.
alter table conversations add column if not exists tasks_synced_n int not null default 0;
alter table conversations add column if not exists tasks_synced_at timestamptz;
alter table conversations add column if not exists task_id text;
