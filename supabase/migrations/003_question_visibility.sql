-- Add visibility toggle for questions
-- Questions are hidden by default, admin reveals them during the poll

ALTER TABLE questions ADD COLUMN is_visible BOOLEAN DEFAULT FALSE;

-- Create index for efficient filtering
CREATE INDEX idx_questions_visibility ON questions(poll_id, is_visible);
