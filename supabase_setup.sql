-- =====================================================
-- REDIGEN - FIXED Supabase Database Setup SQL
-- =====================================================

-- =====================================================
-- 1. USER PROFILES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    display_name TEXT,
    bio TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
-- Create payment records table
CREATE TABLE payment_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_type TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  billing_cycle TEXT NOT NULL,
  status TEXT NOT NULL,
  verified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Add RLS policies
ALTER TABLE payment_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own payments"
  ON payment_records FOR SELECT
  USING (auth.uid() = user_id);
---- Add these fields if they don't exist (safe to run multiple times)
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS dodo_session_id TEXT,
ADD COLUMN IF NOT EXISTS dodo_payment_intent TEXT,
ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_payments_dodo_session ON payments(dodo_session_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_user_status ON payments(user_id, status);
 =====================================================
-- 2. USER PLANS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS user_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_type TEXT DEFAULT 'free' CHECK (
        plan_type IN ('free', 'starter', 'professional', 'enterprise')
    ),
    posts_per_month INTEGER DEFAULT 5,
    credits_remaining INTEGER DEFAULT 5,
    billing_cycle TEXT DEFAULT 'monthly' CHECK (
        billing_cycle IN ('monthly', 'yearly')
    ),
    status TEXT DEFAULT 'active' CHECK (
        status IN ('active', 'inactive', 'expired')
    ),
    amount DECIMAL(10, 2) DEFAULT 0,
    activated_at TIMESTAMP,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- 3. POST HISTORY TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS post_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subreddit TEXT NOT NULL,
    title TEXT,
    content TEXT,
    post_type TEXT DEFAULT 'generated' CHECK (
        post_type IN ('generated', 'optimized')
    ),
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- 4. PAYMENTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    customer_email TEXT,
    transaction_id TEXT UNIQUE NOT NULL,
    plan_type TEXT NOT NULL,
    amount DECIMAL(10, 2),
    posts_per_month INTEGER,
    billing_cycle TEXT,
    status TEXT DEFAULT 'pending' CHECK (
        status IN ('pending', 'completed', 'failed', 'refunded')
    ),
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- 5. FEEDBACK TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    feedback_type TEXT NOT NULL CHECK (
        feedback_type IN ('general', 'bug', 'feature', 'improvement')
    ),
    message TEXT NOT NULL,
    status TEXT DEFAULT 'new' CHECK (
        status IN ('new', 'reviewed', 'resolved', 'archived')
    ),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- 5. INDEXES FOR PERFORMANCE
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_plans_user_id ON user_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_post_history_user_id ON post_history(user_id);
CREATE INDEX IF NOT EXISTS idx_post_history_created_at ON post_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_transaction_id ON payments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at DESC);

-- =====================================================
-- 6. ROW LEVEL SECURITY (RLS) - CRITICAL FIX
-- =====================================================
-- Enable RLS on all tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- DROP OLD POLICIES (if they exist)
-- =====================================================
DROP POLICY IF EXISTS "Users can read own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can read own plan" ON user_plans;
DROP POLICY IF EXISTS "Users can read own history" ON post_history;
DROP POLICY IF EXISTS "Users can insert own history" ON post_history;
DROP POLICY IF EXISTS "Users can read own payments" ON payments;

-- =====================================================
-- NEW POLICIES - SERVICE ROLE BYPASS + USER ACCESS
-- =====================================================

-- User Profiles Policies
CREATE POLICY "Service role has full access to profiles"
ON user_profiles
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Users can read own profile"
ON user_profiles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
ON user_profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
ON user_profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- User Plans Policies
CREATE POLICY "Service role has full access to plans"
ON user_plans
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Users can read own plan"
ON user_plans
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Post History Policies
CREATE POLICY "Service role has full access to history"
ON post_history
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Users can read own history"
ON post_history
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own history"
ON post_history
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Payments Policies
CREATE POLICY "Service role has full access to payments"
ON payments
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Users can read own payments"
ON payments
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Feedback Policies
CREATE POLICY "Service role has full access to feedback"
ON feedback
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Users can insert own feedback"
ON feedback
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own feedback"
ON feedback
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- =====================================================
-- 7. GRANT PERMISSIONS TO SERVICE ROLE (CRITICAL)
-- =====================================================
GRANT ALL ON user_profiles TO service_role;
GRANT ALL ON user_plans TO service_role;
GRANT ALL ON post_history TO service_role;
GRANT ALL ON payments TO service_role;
GRANT ALL ON feedback TO service_role;

-- Grant usage on sequences (needed for auto-increment)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- =====================================================
-- 8. VERIFICATION QUERY
-- =====================================================
-- Run this to verify tables and policies exist:
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
