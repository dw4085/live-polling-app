-- Add multi-select support for "check all that apply" questions

-- Add allow_multiple column to questions
ALTER TABLE questions ADD COLUMN allow_multiple BOOLEAN DEFAULT FALSE;

-- Drop the existing unique constraint that only allows one response per session+question
ALTER TABLE responses DROP CONSTRAINT IF EXISTS responses_session_id_question_id_key;

-- Add new unique constraint that prevents duplicate option picks but allows multi-select
ALTER TABLE responses ADD CONSTRAINT responses_session_question_option_key
  UNIQUE (session_id, question_id, answer_option_id);
