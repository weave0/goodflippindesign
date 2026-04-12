---
description: "Use when writing, reviewing, or applying D1 database schema migrations, seed scripts, or SQL queries for the gfd_community database. Covers SQLite compatibility rules, naming conventions, migration safety, and how to apply changes via wrangler."
applyTo: "d1-*.sql"
---

# D1 Schema Standards — GFD Ecosystem

## Runtime: Cloudflare D1 = SQLite

D1 uses **SQLite 3**. Some SQL that works in Postgres/MySQL will fail silently or error:

- ✅ `TEXT`, `INTEGER`, `REAL`, `BLOB`, `NUMERIC` — use these types
- ❌ `VARCHAR(n)`, `SERIAL`, `BIGSERIAL`, `UUID` type — not native; use `TEXT`
- ❌ Stored procedures, triggers (limited D1 support) — avoid
- ❌ `RETURNING` clause — not supported on all D1 versions; check before use
- ❌ `ALTER TABLE ... ADD COLUMN ... NOT NULL` without a DEFAULT — will fail if table has rows

## Naming Conventions (match existing schema)

| Pattern      | Example                                     |
| ------------ | ------------------------------------------- | --------------------------------------------- |
| Table names  | `snake_case`, plural                        | `cms_assets`, `user_profiles`, `social_posts` |
| Primary keys | `id INTEGER PRIMARY KEY AUTOINCREMENT`      | all tables                                    |
| Foreign keys | `<table_singular>_id`                       | `user_id`, `asset_id`                         |
| Timestamps   | `created_at TEXT DEFAULT (datetime('now'))` | all tables                                    |
| Boolean      | `INTEGER DEFAULT 0` (0/1)                   | SQLite has no BOOL type                       |
| JSON blobs   | `TEXT` column, store as JSON string         | `metadata TEXT`                               |

## Required Columns (every new table)

```sql
CREATE TABLE IF NOT EXISTS example_table (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  -- ... domain columns ...
  created_at TEXT    DEFAULT (datetime('now')),
  updated_at TEXT    DEFAULT (datetime('now'))
);
```

## Migration Safety Rules

1. **Always use `IF NOT EXISTS`** — `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`
2. **Never DROP in the same file as CREATE** unless you're sure the table is new
3. **Add columns with DEFAULT values** — `ALTER TABLE t ADD COLUMN col TEXT DEFAULT ''`
4. **Test locally first**: `wrangler d1 execute gfd_community --local --file=<file.sql>`
5. **Then apply remotely**: `wrangler d1 execute gfd_community --remote --file=<file.sql>`

## Applying Schema Changes

```powershell
# Local (dev/test) — safe
wrangler d1 execute gfd_community --local --file=d1-schema-<name>.sql

# Remote (production) — irreversible writes
wrangler d1 execute gfd_community --remote --file=d1-schema-<name>.sql

# Verify — inspect tables after
wrangler d1 execute gfd_community --remote --command="SELECT name FROM sqlite_master WHERE type='table'"
```

## File Naming

| Type                      | Convention                       | Example                            |
| ------------------------- | -------------------------------- | ---------------------------------- |
| New schema                | `d1-schema-<domain>.sql`         | `d1-schema-nft.sql`                |
| One-off migration         | `d1-migration-<description>.sql` | `d1-migration-blog-series-seo.sql` |
| Role grants / permissions | `d1-migration-role.sql`          |                                    |
| Seed data                 | `d1-seed-<name>.sql`             | `d1-seed-prompt-registries.sql`    |
| Populate scripts          | `d1-populate-<name>.sql`         | `d1-populate-social-accounts.sql`  |

## Existing Schema Files (reference)

- `d1-schema-community.sql` — user profiles, comments, reactions, moderation
- `d1-schema-cms.sql` — cms_assets, cms_posts, asset_overrides
- `d1-schema-cms-social.sql` — social scheduling tables
- `d1-schema-media-platform.sql` — media platform tables
- `d1-schema-studio.sql` — prompt registries, DALL-E records
- `d1-schema-health.sql` — health sweep results
- `d1-schema-nft.sql` — NFT collections and tokens
- `d1-schema-console.sql` — admin console tables

Always scan existing schema files before creating a new table to avoid duplication.
