-- Mission Control durable work operating system.
-- This is deliberately separate from mc_event_* business telemetry tables.
-- Business events describe product outcomes; these rows describe operator work.
--
-- Apply:
--   wrangler d1 execute gfd_community --remote --file=db/d1-schema-mission-control-work-items.sql

CREATE TABLE IF NOT EXISTS mc_work_items (
  work_item_id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL,
  stable_key TEXT NOT NULL UNIQUE,
  producer TEXT NOT NULL,
  property_id TEXT NOT NULL,
  finding_key TEXT NOT NULL,

  repository TEXT,
  investigation_profile TEXT,
  verification_profile TEXT,
  verification_scope TEXT CHECK (
    verification_scope IS NULL OR verification_scope IN (
      'production',
      'control-plane',
      'repository',
      'configuration',
      'deployment'
    )
  ),
  verification_predicate TEXT,

  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 1 CHECK (occurrence_count >= 1),
  recurrence_count INTEGER NOT NULL DEFAULT 0 CHECK (recurrence_count >= 0),

  severity TEXT,
  confidence REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  evidence_revision TEXT,
  evidence_digest TEXT NOT NULL,

  lifecycle_state TEXT NOT NULL CHECK (lifecycle_state IN (
    'OBSERVED',
    'QUALIFIED',
    'INVESTIGATION_READY',
    'INVESTIGATING',
    'DIAGNOSED',
    'REPAIR_READY',
    'REPAIRING',
    'CANDIDATE_READY',
    'VERIFIED',
    'CHANGE_PUBLISHED',
    'DEPLOYED',
    'REVERIFYING',
    'RESOLVED',
    'BLOCKED',
    'NEEDS_HUMAN',
    'DISMISSED',
    'SUPERSEDED',
    'RECURRENT'
  )),
  resume_state TEXT,

  active_lease_id TEXT,
  active_worker_id TEXT,
  lease_expires_at TEXT,

  diagnosis_result_digest TEXT,
  diagnosis_signature_ref TEXT,

  repair_authority_ref TEXT,
  candidate_digest TEXT,
  verification_evidence_digest TEXT,

  published_effect_ref TEXT,
  deployed_effect_ref TEXT,

  resolution_evidence_digest TEXT,
  resolved_at TEXT,

  lifecycle_version INTEGER NOT NULL DEFAULT 1 CHECK (lifecycle_version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mc_work_items_property
  ON mc_work_items (property_id, lifecycle_state);

CREATE INDEX IF NOT EXISTS idx_mc_work_items_state
  ON mc_work_items (lifecycle_state, updated_at);

CREATE INDEX IF NOT EXISTS idx_mc_work_items_last_seen
  ON mc_work_items (last_seen);

-- Append-only lifecycle/evidence journal.
-- The current row above is a projection; this table is the inspectable history.
CREATE TABLE IF NOT EXISTS mc_work_item_events (
  event_id TEXT PRIMARY KEY,
  work_item_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  from_state TEXT,
  to_state TEXT,
  occurred_at TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  evidence_digest TEXT,
  detail_json TEXT,
  FOREIGN KEY (work_item_id) REFERENCES mc_work_items(work_item_id)
);

CREATE INDEX IF NOT EXISTS idx_mc_work_item_events_item_time
  ON mc_work_item_events (work_item_id, occurred_at);

-- Durable consequence ledger / transactional outbox (contract gfd-effect-1).
-- The deterministic effect_id is the idempotency key. Intent is committed
-- here before any remote call. Delivery is at-least-once; a receipt is
-- accepted once for the fenced attempt. See d1-migration-mission-control-outbox.sql
-- for databases created before these columns existed.
CREATE TABLE IF NOT EXISTS mc_effects (
  effect_id TEXT PRIMARY KEY,
  work_item_id TEXT NOT NULL,
  effect_type TEXT NOT NULL,
  target TEXT NOT NULL,
  candidate_digest TEXT,
  status TEXT NOT NULL CHECK (status IN ('PLANNED', 'COMMITTED', 'VERIFIED', 'FAILED')),
  provider_ref TEXT,
  created_at TEXT NOT NULL,
  committed_at TEXT,
  verified_at TEXT,
  last_error TEXT,
  schema_version TEXT,
  requested_lifecycle_version INTEGER,
  payload_digest TEXT,
  payload_json TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  idempotency_key TEXT,
  causal_event_id TEXT,
  receipt_ref TEXT,
  terminal_reason TEXT,
  FOREIGN KEY (work_item_id) REFERENCES mc_work_items(work_item_id)
);

CREATE INDEX IF NOT EXISTS idx_mc_effects_work_item
  ON mc_effects (work_item_id, created_at);

CREATE INDEX IF NOT EXISTS idx_mc_effects_dispatch
  ON mc_effects (status, last_attempt_at);

-- An active lease is represented on mc_work_items for fast operator reads.
-- This historical table preserves claims/releases and makes lease contention
-- auditable without treating a queue row as authority.
CREATE TABLE IF NOT EXISTS mc_work_item_leases (
  lease_id TEXT PRIMARY KEY,
  work_item_id TEXT NOT NULL,
  worker_id TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  released_at TEXT,
  release_reason TEXT,
  FOREIGN KEY (work_item_id) REFERENCES mc_work_items(work_item_id)
);

CREATE INDEX IF NOT EXISTS idx_mc_work_item_leases_item
  ON mc_work_item_leases (work_item_id, issued_at);
