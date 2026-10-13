-- PollAnywhere: sign in through the class hub.
-- Run once in the Neon SQL Editor on an existing database (safe to run again). A fresh database
-- only needs schema.sql, which already includes all of this.
--
-- Identity now comes from the class hub: students vote as their hub person id, and the hub's
-- instructors and TAs run every poll. Existing rows survive: earlier anonymous sessions (no
-- student_id) keep counting in their polls' results; the admins table and polls.admin_id are no
-- longer read or written (Neon Auth and the superadmin password are gone) and can be dropped
-- whenever you like:
--   ALTER TABLE polls DROP COLUMN admin_id;  DROP TABLE admins;

-- Who created the poll (hub person id of an instructor or TA)
ALTER TABLE polls ADD COLUMN IF NOT EXISTS created_by UUID;

-- Participant sessions belong to a signed-in student: one per student per poll
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS student_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS sessions_poll_student_key ON sessions (poll_id, student_id);

-- Anonymous session tokens are no longer issued
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = current_schema() AND table_name = 'sessions' AND column_name = 'session_token') THEN
    ALTER TABLE sessions ALTER COLUMN session_token DROP NOT NULL;
  END IF;
END $$;

-- Activity reports held until the class hub has them (kit: OUTBOX_TABLE_SQL)
CREATE TABLE IF NOT EXISTS hub_outbox (
  id               UUID PRIMARY KEY,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  event            JSON NOT NULL,          -- the report as sent (JSON keeps the snapshot's field order)
  attempts         INTEGER NOT NULL DEFAULT 0,
  last_attempt_at  TIMESTAMPTZ,
  last_error       TEXT,
  delivered_at     TIMESTAMPTZ,
  failed_at        TIMESTAMPTZ             -- rejected by the hub as malformed; not retried
);
CREATE INDEX IF NOT EXISTS hub_outbox_pending ON hub_outbox (created_at) WHERE delivered_at IS NULL AND failed_at IS NULL;
