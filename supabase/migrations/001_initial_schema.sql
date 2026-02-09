-- Live Polling App - Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- POLLS TABLE
-- ============================================
CREATE TABLE polls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

    CONSTRAINT valid_slug CHECK (slug IS NULL OR slug ~ '^[a-z0-9-]+$')
);

CREATE INDEX idx_polls_access_code ON polls(access_code);
CREATE INDEX idx_polls_slug ON polls(slug) WHERE slug IS NOT NULL;
CREATE INDEX idx_polls_state ON polls(state);
CREATE INDEX idx_polls_auto_delete ON polls(auto_delete_at) WHERE auto_delete_at IS NOT NULL;

-- ============================================
-- QUESTIONS TABLE
-- ============================================
CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_order INTEGER NOT NULL DEFAULT 0,
    chart_type VARCHAR(20) DEFAULT 'horizontal_bar'
        CHECK (chart_type IN ('horizontal_bar', 'vertical_bar', 'pie', 'donut')),
    is_revealed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_questions_poll_id ON questions(poll_id);
CREATE INDEX idx_questions_order ON questions(poll_id, question_order);

-- ============================================
-- ANSWER OPTIONS TABLE
-- ============================================
CREATE TABLE answer_options (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    option_text VARCHAR(500) NOT NULL,
    option_order INTEGER NOT NULL DEFAULT 0,
    color VARCHAR(7),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_answer_options_question_id ON answer_options(question_id);

-- ============================================
-- SESSIONS TABLE
-- ============================================
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    session_token VARCHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_poll_id ON sessions(poll_id);
CREATE INDEX idx_sessions_token ON sessions(session_token);
CREATE INDEX idx_sessions_activity ON sessions(poll_id, last_activity_at);

-- ============================================
-- RESPONSES TABLE
-- ============================================
CREATE TABLE responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    answer_option_id UUID NOT NULL REFERENCES answer_options(id) ON DELETE CASCADE,
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(session_id, question_id)
);

CREATE INDEX idx_responses_session_id ON responses(session_id);
CREATE INDEX idx_responses_question_id ON responses(question_id);
CREATE INDEX idx_responses_answer_option_id ON responses(answer_option_id);

-- ============================================
-- CROSS-TABULATION CONFIGS
-- ============================================
CREATE TABLE cross_tab_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    question_1_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    question_2_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(poll_id, question_1_id, question_2_id),
    CHECK (question_1_id != question_2_id)
);

-- ============================================
-- ADMIN TOKENS
-- ============================================
CREATE TABLE admin_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ
);

CREATE INDEX idx_admin_tokens_expires ON admin_tokens(expires_at);

-- ============================================
-- VIEWS
-- ============================================

-- Response counts per answer option
CREATE OR REPLACE VIEW response_counts AS
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

-- Active participant count per poll
CREATE OR REPLACE VIEW active_participants AS
SELECT
    poll_id,
    COUNT(DISTINCT id)::INTEGER AS participant_count
FROM sessions
WHERE last_activity_at > NOW() - INTERVAL '30 minutes'
GROUP BY poll_id;

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
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

-- Auto-set delete date when poll closes
CREATE OR REPLACE FUNCTION set_auto_delete_date()
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

-- Update session activity on response
CREATE OR REPLACE FUNCTION update_session_activity()
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
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE answer_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE responses ENABLE ROW LEVEL SECURITY;

-- Polls: Allow read access for open/closed polls, full access for service role
CREATE POLICY "Polls viewable when open/closed" ON polls
    FOR SELECT USING (state IN ('open', 'closed'));

CREATE POLICY "Polls full access for service role" ON polls
    FOR ALL USING (auth.role() = 'service_role');

-- Questions: Allow read access for questions in open/closed polls
CREATE POLICY "Questions viewable for open polls" ON questions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM polls
            WHERE polls.id = questions.poll_id
            AND polls.state IN ('open', 'closed')
        )
    );

CREATE POLICY "Questions full access for service role" ON questions
    FOR ALL USING (auth.role() = 'service_role');

-- Answer options: Allow read access for options in open/closed polls
CREATE POLICY "Options viewable for open polls" ON answer_options
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM questions q
            JOIN polls p ON p.id = q.poll_id
            WHERE q.id = answer_options.question_id
            AND p.state IN ('open', 'closed')
        )
    );

CREATE POLICY "Options full access for service role" ON answer_options
    FOR ALL USING (auth.role() = 'service_role');

-- Sessions: Allow insert for anon users, full access for service role
CREATE POLICY "Sessions insert for anon" ON sessions
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Sessions select own" ON sessions
    FOR SELECT USING (true);

CREATE POLICY "Sessions full access for service role" ON sessions
    FOR ALL USING (auth.role() = 'service_role');

-- Responses: Allow insert/update for participants, read when revealed
CREATE POLICY "Responses insert for participants" ON responses
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Responses update own" ON responses
    FOR UPDATE USING (true);

CREATE POLICY "Responses viewable when revealed" ON responses
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM questions q
            JOIN polls p ON p.id = q.poll_id
            WHERE q.id = responses.question_id
            AND (q.is_revealed = true OR p.results_revealed = true)
        )
        OR auth.role() = 'service_role'
    );

CREATE POLICY "Responses full access for service role" ON responses
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- REALTIME SUBSCRIPTIONS
-- ============================================

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE polls;
ALTER PUBLICATION supabase_realtime ADD TABLE questions;
ALTER PUBLICATION supabase_realtime ADD TABLE responses;
ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
