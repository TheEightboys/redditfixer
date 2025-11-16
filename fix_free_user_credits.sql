-- =====================================================
-- FIX FREE USER CREDITS FROM 10 TO 5
-- Run this in Supabase SQL Editor to update existing users
-- =====================================================

-- Update all free plan users who currently have 10 posts to 5 posts
UPDATE user_plans
SET 
    posts_per_month = 5,
    credits_remaining = 5,
    updated_at = NOW()
WHERE 
    plan_type = 'free' 
    AND posts_per_month = 10
    AND credits_remaining = 10;

-- Verify the update
SELECT 
    user_id,
    plan_type,
    posts_per_month,
    credits_remaining,
    status
FROM user_plans
WHERE plan_type = 'free'
ORDER BY created_at DESC;
