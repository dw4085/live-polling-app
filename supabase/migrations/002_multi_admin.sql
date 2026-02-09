-- Multi-Admin Feature Migration
-- Adds admin users, approval workflow, and poll ownership

-- ============================================
-- ADMINS TABLE
-- ============================================
CREATE TABLE admins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_user_id UUID UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    affiliation TEXT,
    role VARCHAR(20) DEFAULT 'admin' CHECK (role IN ('admin', 'superadmin')),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES admins(id)
);

CREATE INDEX idx_admins_email ON admins(email);
CREATE INDEX idx_admins_auth_user_id ON admins(auth_user_id);
CREATE INDEX idx_admins_status ON admins(status);

-- ============================================
-- ADD ADMIN_ID TO POLLS
-- ============================================
ALTER TABLE polls ADD COLUMN admin_id UUID REFERENCES admins(id);

CREATE INDEX idx_polls_admin_id ON polls(admin_id);

-- ============================================
-- INSERT SUPERADMIN
-- ============================================
INSERT INTO admins (email, name, affiliation, role, status, approved_at)
VALUES ('djw2104@columbia.edu', 'Dan Wang', 'Columbia Business School', 'superadmin', 'approved', NOW());

-- ============================================
-- MIGRATE EXISTING POLLS TO SUPERADMIN
-- ============================================
UPDATE polls SET admin_id = (SELECT id FROM admins WHERE role = 'superadmin' LIMIT 1);

-- ============================================
-- RLS POLICIES FOR ADMINS TABLE
-- ============================================
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- Allow reading admin records (needed for login lookups)
CREATE POLICY "Allow reading admins" ON admins
    FOR SELECT USING (true);

-- Allow insert for new signups (auth user can create their own record)
CREATE POLICY "Users can create own admin record" ON admins
    FOR INSERT WITH CHECK (
        auth.uid() = auth_user_id
        OR auth.role() = 'service_role'
    );

-- Superadmins can update any admin (for approvals)
CREATE POLICY "Superadmins can update admins" ON admins
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM admins a
            WHERE a.auth_user_id = auth.uid()
            AND a.role = 'superadmin'
        )
        OR auth.role() = 'service_role'
    );

-- Full access for service role
CREATE POLICY "Admins full access for service role" ON admins
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- UPDATED RLS POLICIES FOR POLLS
-- ============================================

-- Drop existing policies that need updating
DROP POLICY IF EXISTS "Polls full access for service role" ON polls;

-- Admins can read their own polls (or superadmin can read all)
CREATE POLICY "Admins can read own polls" ON polls
    FOR SELECT USING (
        -- Public access for open/closed polls (existing behavior)
        state IN ('open', 'closed')
        -- Admin access to own polls
        OR EXISTS (
            SELECT 1 FROM admins a
            WHERE a.auth_user_id = auth.uid()
            AND (a.id = polls.admin_id OR a.role = 'superadmin')
            AND a.status = 'approved'
        )
        OR auth.role() = 'service_role'
    );

-- Admins can insert polls with their own admin_id
CREATE POLICY "Admins can create polls" ON polls
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM admins a
            WHERE a.auth_user_id = auth.uid()
            AND a.id = admin_id
            AND a.status = 'approved'
        )
        OR auth.role() = 'service_role'
    );

-- Admins can update their own polls (superadmin can update all)
CREATE POLICY "Admins can update own polls" ON polls
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM admins a
            WHERE a.auth_user_id = auth.uid()
            AND (a.id = polls.admin_id OR a.role = 'superadmin')
            AND a.status = 'approved'
        )
        OR auth.role() = 'service_role'
    );

-- Admins can delete their own polls (superadmin can delete all)
CREATE POLICY "Admins can delete own polls" ON polls
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM admins a
            WHERE a.auth_user_id = auth.uid()
            AND (a.id = polls.admin_id OR a.role = 'superadmin')
            AND a.status = 'approved'
        )
        OR auth.role() = 'service_role'
    );

-- ============================================
-- ADD REALTIME FOR ADMINS
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE admins;
