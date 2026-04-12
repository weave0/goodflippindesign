-- ─────────────────────────────────────────────────────────────────────────────
-- Account Linking: cross-reference between social_accounts ↔ cms_platform_tokens
-- Adds platform_user_id (native external ID), token_fingerprint (SHA-256[:16]
-- of brand|platform|platform_user_id), and link_status to social_accounts.
-- Adds a reverse-link (social_account_id + token_fingerprint) to cms_platform_tokens.
--
-- Apply: wrangler d1 execute gfd_community --remote --file=d1-schema-account-links.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- social_accounts additions
ALTER TABLE social_accounts ADD COLUMN platform_user_id TEXT DEFAULT '';
ALTER TABLE social_accounts ADD COLUMN token_fingerprint TEXT DEFAULT '';
ALTER TABLE social_accounts ADD COLUMN link_status TEXT DEFAULT 'unlinked';

-- cms_platform_tokens additions (reverse link + fingerprint)
ALTER TABLE cms_platform_tokens ADD COLUMN social_account_id INTEGER DEFAULT NULL;
ALTER TABLE cms_platform_tokens ADD COLUMN token_fingerprint TEXT DEFAULT '';
