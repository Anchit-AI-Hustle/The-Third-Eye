-- Task autopilot (frontend/src/lib/taskAutopilot.ts): JARVIS works each new
-- task and records how it went. Status: running | done | needs_you | failed.
alter table tasks add column if not exists autopilot_status text;
alter table tasks add column if not exists autopilot_report text;
alter table tasks add column if not exists autopilot_at timestamptz;
