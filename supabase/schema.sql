-- ============================================================================
-- Keyprint — Supabase Postgres Index Schema & Private Storage Setup
-- Run this once in Supabase Dashboard -> SQL Editor.
-- Note: Arc Testnet contracts remain the source of truth for fingerprints,
--       co-signs, deposit amounts, claims, and deadlines.
-- ============================================================================

-- 1. Create private storage bucket (50 MB max per file, never public)
insert into storage.buckets (id, name, public, file_size_limit)
values ('keyprint-private', 'keyprint-private', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

-- 2. Leases metadata cache (deposit/state/claims are ALWAYS read live from Arc)
create table if not exists public.leases (
  lease_id text primary key,
  unit_id text not null,
  unit_name text not null,
  landlord_address text not null,
  renter_address text not null,
  reviewer_address text not null,
  move_in_scan_path text,
  move_out_scan_path text,
  move_in_record_id text,
  move_out_record_id text,
  alignment_record_id text,
  report_record_id text,
  alignment_matrix jsonb,
  alignment_metrics jsonb,
  created_tx_hash text,
  funded_tx_hash text,
  ended_tx_hash text,
  settled_tx_hash text,
  total_gas_cost_wei text default '0',
  tx_count integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Sealed records & exact RFC 8785 canonical manifest bytes + tx receipt metadata
create table if not exists public.records (
  record_id text primary key,
  unit_id text not null,
  lease_id text not null,
  kind integer not null,
  content_hash text not null,
  author text not null,
  manifest_json text not null,
  file_paths jsonb not null default '[]'::jsonb,
  tx_hash text,
  block_number bigint,
  gas_cost_wei text default '0',
  sealed_at timestamptz not null default now()
);

create index if not exists idx_records_lease_id on public.records (lease_id);
create index if not exists idx_records_unit_id on public.records (unit_id);

-- 4. Cached AI comparison reports (keyed by record IDs + view IDs + prompt version)
create table if not exists public.ai_reports (
  cache_key text primary key,
  lease_id text not null,
  move_in_record_id text not null,
  move_out_record_id text not null,
  prompt_version text not null,
  view_ids jsonb not null,
  report_json jsonb not null,
  created_at timestamptz not null default now()
);

-- 5. Enable Row Level Security (server routes use service_role key)
alter table public.leases enable row level security;
alter table public.records enable row level security;
alter table public.ai_reports enable row level security;
