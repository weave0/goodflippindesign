-- ═══════════════════════════════════════════════════════════════
-- D1 Schema: NFT Collections + Tokens
-- Run AFTER d1-schema-cms.sql
--
-- These tables are also lazy-created by ensureNFTSchema() in workers/cms.js
-- on first request — this file exists for documentation, manual migrations,
-- and fresh D1 instance bootstrapping.
-- ═══════════════════════════════════════════════════════════════

-- ── NFT Collections ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cms_nft_collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand TEXT NOT NULL DEFAULT 'gfv',
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  contract_address TEXT DEFAULT '',
  marketplace_url TEXT DEFAULT '',
  status TEXT DEFAULT 'draft',             -- draft, minting, live, archived
  created_by TEXT DEFAULT '',              -- Clerk user ID
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cms_nft_collections_brand   ON cms_nft_collections(brand);
CREATE INDEX IF NOT EXISTS idx_cms_nft_collections_status  ON cms_nft_collections(status);

-- ── NFT Tokens (editions within a collection) ─────────────────
CREATE TABLE IF NOT EXISTS cms_nft_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  collection_id INTEGER NOT NULL REFERENCES cms_nft_collections(id),
  asset_id TEXT DEFAULT '',               -- FK to cms_assets.id (source artwork)
  edition_number INTEGER,                 -- e.g. 1 of 100
  token_id_onchain TEXT DEFAULT '',       -- on-chain token ID after mint
  ipfs_image_cid TEXT DEFAULT '',
  ipfs_metadata_cid TEXT DEFAULT '',
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  external_url TEXT DEFAULT '',
  background_color TEXT DEFAULT '',
  animation_url TEXT DEFAULT '',
  attributes_json TEXT DEFAULT '[]',      -- ERC-721 trait array JSON
  rarity TEXT DEFAULT 'Common',           -- Common, Uncommon, Rare, Epic, Legendary
  rarity_tier INTEGER DEFAULT 1,          -- numeric tier for sorting
  status TEXT DEFAULT 'draft',            -- draft, ready, minting, minted, failed
  mint_tx_hash TEXT DEFAULT '',           -- on-chain transaction hash
  minted_at TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cms_nft_tokens_collection   ON cms_nft_tokens(collection_id);
CREATE INDEX IF NOT EXISTS idx_cms_nft_tokens_status       ON cms_nft_tokens(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cms_nft_tokens_edition
  ON cms_nft_tokens(collection_id, edition_number);
