-- FarmHisab schema. All money is integer paise. All writes go through the SECURITY DEFINER
-- functions in 0002_functions.sql; clients get read-only table access limited by RLS.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  preferred_language text not null default 'kn' check (preferred_language in ('en','kn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, preferred_language)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''),
          case when new.raw_user_meta_data->>'lang' in ('en','kn') then new.raw_user_meta_data->>'lang' else 'kn' end)
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- projects & members ----------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  crop_name text not null check (char_length(crop_name) between 1 and 80),
  season text not null check (char_length(season) between 1 and 40),
  village text,
  land_area numeric(12,2) check (land_area is null or land_area > 0),
  land_area_unit text check (land_area_unit is null or land_area_unit in ('acre','guntha','hectare')),
  status text not null default 'active' check (status in ('active','harvesting','settled','archived')),
  approval_policy text not null default 'notify_only' check (approval_policy in ('notify_only','require_confirmation')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);
create trigger projects_updated before update on public.projects for each row execute function public.set_updated_at();

create table public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('farmer','landowner','partner')),
  is_admin boolean not null default false,
  display_name text not null check (char_length(display_name) between 1 and 80),
  status text not null default 'active' check (status in ('active','removed')),
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  unique (project_id, user_id)
);
create index on public.project_members (user_id) where status = 'active';

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  role text not null check (role in ('farmer','landowner','partner')),
  token_hash text not null unique,           -- sha256 of the secret token; the token itself is never stored
  invited_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- agreements (versioned) ----------
create table public.agreement_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  version int not null,
  status text not null default 'proposed' check (status in ('proposed','approved','superseded')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  unique (project_id, version)
);
create table public.agreement_shares (
  agreement_id uuid not null references public.agreement_versions(id) on delete cascade,
  member_id uuid not null references public.project_members(id),
  expense_bps int not null check (expense_bps between 0 and 10000),
  profit_bps int not null check (profit_bps between 0 and 10000),
  primary key (agreement_id, member_id)
);
create table public.agreement_approvals (
  agreement_id uuid not null references public.agreement_versions(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  approved_at timestamptz not null default now(),
  primary key (agreement_id, user_id)
);

-- ---------- expenses ----------
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  client_id uuid not null,                     -- idempotency key generated on the device
  amount_paise bigint not null check (amount_paise > 0 and amount_paise < 100000000000),
  category text not null check (category in ('seeds','fertilizers','pesticides','labour','machinery','irrigation','transport','land_preparation','harvesting','other')),
  paid_by uuid not null references public.project_members(id),
  created_by uuid not null references auth.users(id),
  expense_date date not null,
  description text check (description is null or char_length(description) <= 200),
  payment_method text check (payment_method is null or payment_method in ('cash','upi','bank','credit','other')),
  notes text check (notes is null or char_length(notes) <= 500),
  status text not null default 'awaiting_review' check (status in ('awaiting_review','confirmed','disputed','resolved','reversed')),
  reversed_at timestamptz,
  reversed_by uuid references auth.users(id),
  reversal_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, client_id)
);
create index on public.expenses (project_id, expense_date desc);
create trigger expenses_updated before update on public.expenses for each row execute function public.set_updated_at();

create table public.expense_status_history (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  from_status text,
  to_status text not null,
  action text not null,
  note text,
  actor uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index on public.expense_status_history (expense_id, created_at);

-- ---------- income ----------
create table public.incomes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  client_id uuid not null,
  kind text not null check (kind in ('crop_sale','other_income','refund_received','adjustment')),
  amount_paise bigint not null check (amount_paise <> 0 and abs(amount_paise) < 100000000000),
  income_date date not null,
  buyer text check (buyer is null or char_length(buyer) <= 120),
  quantity numeric(14,3) check (quantity is null or quantity > 0),
  quantity_unit text check (quantity_unit is null or quantity_unit in ('quintal','kg','ton','bag','piece','other')),
  unit_price_paise bigint check (unit_price_paise is null or unit_price_paise > 0),
  payment_status text not null default 'received' check (payment_status in ('received','pending')),
  received_by uuid references public.project_members(id),
  payment_details text check (payment_details is null or char_length(payment_details) <= 300),
  notes text check (notes is null or char_length(notes) <= 500),
  status text not null default 'active' check (status in ('active','reversed')),
  reversed_at timestamptz,
  reversed_by uuid references auth.users(id),
  reversal_reason text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, client_id),
  check (kind = 'adjustment' or amount_paise > 0)
);
create index on public.incomes (project_id, income_date desc);
create trigger incomes_updated before update on public.incomes for each row execute function public.set_updated_at();

-- ---------- payments between partners ----------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  client_id uuid not null,
  from_member uuid not null references public.project_members(id),
  to_member uuid not null references public.project_members(id),
  amount_paise bigint not null check (amount_paise > 0 and amount_paise < 100000000000),
  paid_on date not null,
  method text check (method is null or method in ('cash','upi','bank','other')),
  note text check (note is null or char_length(note) <= 300),
  status text not null default 'active' check (status in ('active','reversed')),
  reversed_at timestamptz,
  reversal_reason text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (project_id, client_id),
  check (from_member <> to_member)
);

-- ---------- attachments (receipts, sale documents) ----------
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  entity_type text not null check (entity_type in ('expense','income')),
  entity_id uuid not null,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','image/heic')),
  size_bytes int not null check (size_bytes > 0 and size_bytes <= 5242880),
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references auth.users(id)
);
create index on public.attachments (entity_type, entity_id);

-- ---------- settlements ----------
create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  version int not null,
  basis text not null check (basis in ('received','recorded')),
  agreement_id uuid not null references public.agreement_versions(id),
  snapshot jsonb not null,                     -- exact inputs and results used; immutable
  snapshot_hash text not null,
  status text not null default 'pending_confirmation' check (status in ('pending_confirmation','final','superseded','void')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  unique (project_id, version)
);
create table public.settlement_confirmations (
  settlement_id uuid not null references public.settlements(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  agreement_id uuid not null references public.agreement_versions(id),
  confirmed_at timestamptz not null default now(),
  primary key (settlement_id, user_id)
);
create table public.settlement_amendments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  settlement_id uuid not null references public.settlements(id),
  reason text not null check (char_length(reason) between 3 and 500),
  requested_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

-- ---------- audit log ----------
create table public.audit_events (
  id bigint generated always as identity primary key,
  project_id uuid references public.projects(id) on delete cascade,
  actor uuid,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index on public.audit_events (project_id, created_at desc);

-- Audit rows, status history, and finalized settlement snapshots can never be rewritten.
create or replace function public.forbid_change() returns trigger language plpgsql as $$
begin raise exception 'FH_IMMUTABLE'; end $$;
create trigger audit_no_update before update or delete on public.audit_events for each row execute function public.forbid_change();
create trigger history_no_update before update or delete on public.expense_status_history for each row execute function public.forbid_change();
create trigger confirmations_no_update before update or delete on public.settlement_confirmations for each row execute function public.forbid_change();
create trigger amendments_no_update before update or delete on public.settlement_amendments for each row execute function public.forbid_change();

create or replace function public.settlement_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'FH_IMMUTABLE'; end if;
  if new.snapshot is distinct from old.snapshot or new.snapshot_hash <> old.snapshot_hash
     or new.agreement_id <> old.agreement_id or new.basis <> old.basis or new.version <> old.version then
    raise exception 'FH_IMMUTABLE';
  end if;
  return new;
end $$;
create trigger settlements_guard before update or delete on public.settlements for each row execute function public.settlement_guard();

-- ---------- row level security helpers ----------
create or replace function public.is_member(pid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from project_members where project_id = pid and user_id = auth.uid() and status = 'active')
$$;
create or replace function public.is_admin(pid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from project_members where project_id = pid and user_id = auth.uid() and status = 'active' and is_admin)
$$;
create or replace function public.safe_uuid(t text) returns uuid language plpgsql immutable as $$
begin return t::uuid; exception when others then return null; end $$;

-- ---------- RLS: read-only for members; every write goes through functions ----------
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.invitations enable row level security;
alter table public.agreement_versions enable row level security;
alter table public.agreement_shares enable row level security;
alter table public.agreement_approvals enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_status_history enable row level security;
alter table public.incomes enable row level security;
alter table public.payments enable row level security;
alter table public.attachments enable row level security;
alter table public.settlements enable row level security;
alter table public.settlement_confirmations enable row level security;
alter table public.settlement_amendments enable row level security;
alter table public.audit_events enable row level security;

create policy profiles_read on public.profiles for select to authenticated using (
  id = auth.uid() or exists (
    select 1 from project_members a join project_members b on a.project_id = b.project_id
    where a.user_id = auth.uid() and a.status = 'active' and b.user_id = profiles.id and b.status = 'active'));
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy projects_read on public.projects for select to authenticated using (public.is_member(id));
create policy members_read on public.project_members for select to authenticated using (public.is_member(project_id) or user_id = auth.uid());
create policy invitations_read on public.invitations for select to authenticated using (public.is_admin(project_id));
create policy agreements_read on public.agreement_versions for select to authenticated using (public.is_member(project_id));
create policy agreement_shares_read on public.agreement_shares for select to authenticated using (
  exists (select 1 from agreement_versions v where v.id = agreement_id and public.is_member(v.project_id)));
create policy agreement_approvals_read on public.agreement_approvals for select to authenticated using (
  exists (select 1 from agreement_versions v where v.id = agreement_id and public.is_member(v.project_id)));
create policy expenses_read on public.expenses for select to authenticated using (public.is_member(project_id));
create policy history_read on public.expense_status_history for select to authenticated using (public.is_member(project_id));
create policy incomes_read on public.incomes for select to authenticated using (public.is_member(project_id));
create policy payments_read on public.payments for select to authenticated using (public.is_member(project_id));
create policy attachments_read on public.attachments for select to authenticated using (public.is_member(project_id));
create policy settlements_read on public.settlements for select to authenticated using (public.is_member(project_id));
create policy settlement_conf_read on public.settlement_confirmations for select to authenticated using (
  exists (select 1 from settlements s where s.id = settlement_id and public.is_member(s.project_id)));
create policy settlement_amend_read on public.settlement_amendments for select to authenticated using (public.is_member(project_id));
create policy audit_read on public.audit_events for select to authenticated using (project_id is not null and public.is_member(project_id));

-- Defence in depth: no direct writes from clients at all (except own profile update above).
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
grant update (full_name, phone, preferred_language) on public.profiles to authenticated;
grant select on all tables in schema public to authenticated;
