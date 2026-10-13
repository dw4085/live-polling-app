-- PollAnywhere - Neon Postgres schema
-- Run once in the Neon SQL Editor for a fresh database.
-- (Consolidates the former supabase/migrations 001-004, minus Supabase RLS/realtime, and
-- db/hub-migration.sql: sign-in through the class hub. Existing databases: run that file.)
--
-- Everyone signs in at the class hub; students and staff are identified by their hub person id
-- (UUID). The hub's instructors and TAs run polls, so there is no admins table.

-- ============================================
-- POLLS
-- ============================================
CREATE TABLE polls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE,
    access_code VARCHAR(12) NOT NULL UNIQUE,
    password_hash VARCHAR(255),
    state VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (state IN ('draft', 'open', 'closed', 'archived')),
    results_revealed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    auto_delete_at TIMESTAMPTZ,
    created_by UUID,  -- hub person id of the instructor or TA who created it

    CONSTRAINT valid_slug CHECK (slug IS NULL OR slug ~ '^[a-z0-9-]+$')
);

CREATE INDEX idx_polls_state ON polls(state);
CREATE INDEX idx_polls_auto_delete ON polls(auto_delete_at) WHERE auto_delete_at IS NOT NULL;

-- ============================================
-- QUESTIONS
-- ============================================
CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_order INTEGER NOT NULL DEFAULT 0,
    chart_type VARCHAR(20) DEFAULT 'horizontal_bar'
        CHECK (chart_type IN ('horizontal_bar', 'vertical_bar', 'pie', 'donut')),
    is_revealed BOOLEAN DEFAULT FALSE,
    is_visible BOOLEAN DEFAULT FALSE,
    allow_multiple BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_questions_order ON questions(poll_id, question_order);

-- ============================================
-- ANSWER OPTIONS
-- ============================================
CREATE TABLE answer_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    option_text VARCHAR(500) NOT NULL,
    option_order INTEGER NOT NULL DEFAULT 0,
    color VARCHAR(7),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_answer_options_question_id ON answer_options(question_id);

-- ============================================
-- PARTICIPANT SESSIONS (one per signed-in student per poll)
-- ============================================
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    student_id UUID,  -- hub person id
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX sessions_poll_student_key ON sessions (poll_id, student_id);

CREATE INDEX idx_sessions_activity ON sessions(poll_id, last_activity_at);

-- ============================================
-- RESPONSES (one row per selected option; multi-select allowed)
-- ============================================
CREATE TABLE responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    answer_option_id UUID NOT NULL REFERENCES answer_options(id) ON DELETE CASCADE,
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT responses_session_question_option_key
        UNIQUE (session_id, question_id, answer_option_id)
);

CREATE INDEX idx_responses_question_id ON responses(question_id);
CREATE INDEX idx_responses_answer_option_id ON responses(answer_option_id);

-- ============================================
-- VIEWS
-- ============================================
CREATE VIEW response_counts AS
SELECT
    q.poll_id,
    q.id AS question_id,
    ao.id AS answer_option_id,
    ao.option_text,
    ao.option_order,
    ao.color,
    COUNT(r.id)::INTEGER AS response_count
FROM questions q
JOIN answer_options ao ON ao.question_id = q.id
LEFT JOIN responses r ON r.answer_option_id = ao.id
GROUP BY q.poll_id, q.id, ao.id, ao.option_text, ao.option_order, ao.color;

CREATE VIEW active_participants AS
SELECT
    poll_id,
    COUNT(DISTINCT id)::INTEGER AS participant_count
FROM sessions
WHERE last_activity_at > NOW() - INTERVAL '30 minutes'
GROUP BY poll_id;

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================
CREATE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER polls_updated_at
    BEFORE UPDATE ON polls
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER questions_updated_at
    BEFORE UPDATE ON questions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER responses_updated_at
    BEFORE UPDATE ON responses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Stamp closed_at / auto_delete_at when a poll closes
CREATE FUNCTION set_auto_delete_date()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.state = 'closed' AND (OLD.state IS NULL OR OLD.state != 'closed') THEN
        NEW.closed_at = NOW();
        NEW.auto_delete_at = NOW() + INTERVAL '90 days';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER polls_set_auto_delete
    BEFORE UPDATE ON polls
    FOR EACH ROW EXECUTE FUNCTION set_auto_delete_date();

-- Keep a participant "active" while they answer
CREATE FUNCTION update_session_activity()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE sessions SET last_activity_at = NOW() WHERE id = NEW.session_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER responses_update_session
    AFTER INSERT OR UPDATE ON responses
    FOR EACH ROW EXECUTE FUNCTION update_session_activity();

-- ============================================
-- CLASS HUB ACTIVITY REPORTS (held until the hub has them; kit: OUTBOX_TABLE_SQL)
-- ============================================
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
