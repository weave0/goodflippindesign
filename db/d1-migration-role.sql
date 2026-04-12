-- Migration: Add role and suspended columns to community_profiles
-- Run via: wrangler d1 execute gfd_community --file=d1-migration-role.sql --remote

ALTER TABLE community_profiles ADD COLUMN role TEXT DEFAULT 'member';
ALTER TABLE community_profiles ADD COLUMN suspended INTEGER DEFAULT 0;

-- Set Brett as admin (replace with your actual Clerk user ID)
-- UPDATE community_profiles SET role = 'admin' WHERE user_id = 'YOUR_CLERK_USER_ID';
