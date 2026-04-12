-- Populate social_accounts from known platform tokens + compute fingerprints
-- Fingerprint = SHA-256(brand|platform|platformUserId)[0:16]

INSERT OR REPLACE INTO social_accounts (brand, platform, handle, display_name, platform_user_id, link_status, token_fingerprint, followers_count, created_at, updated_at)
VALUES
  ('aiaimate',      'x', '@CultureSherps', '@CultureSherps', '2019472281978707970', 'linked', 'e8f681929748a2f7', 0, datetime('now'), datetime('now')),
  ('culturesherpa', 'x', '@CultureSherps', '@CultureSherps', '2019472281978707970', 'linked', '018551071b9cda34', 0, datetime('now'), datetime('now')),
  ('gfd',           'x', '@CultureSherps', '@CultureSherps', '2019472281978707970', 'linked', '10092a899c1b8c16', 0, datetime('now'), datetime('now'));

-- Write fingerprints back to token rows
UPDATE cms_platform_tokens SET token_fingerprint='e8f681929748a2f7'  WHERE brand='aiaimate'      AND platform='x';
UPDATE cms_platform_tokens SET token_fingerprint='018551071b9cda34' WHERE brand='culturesherpa' AND platform='x';
UPDATE cms_platform_tokens SET token_fingerprint='10092a899c1b8c16' WHERE brand='gfd'           AND platform='x';

-- Cross-link: write social_account_id onto token rows
UPDATE cms_platform_tokens SET social_account_id=(SELECT id FROM social_accounts WHERE brand='aiaimate'      AND platform='x') WHERE brand='aiaimate'      AND platform='x';
UPDATE cms_platform_tokens SET social_account_id=(SELECT id FROM social_accounts WHERE brand='culturesherpa' AND platform='x') WHERE brand='culturesherpa' AND platform='x';
UPDATE cms_platform_tokens SET social_account_id=(SELECT id FROM social_accounts WHERE brand='gfd'           AND platform='x') WHERE brand='gfd'           AND platform='x';
