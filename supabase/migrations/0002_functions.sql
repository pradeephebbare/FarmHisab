-- Every write in FarmHisab goes through one of these functions. Each one checks the caller's
-- membership, validates input, writes an audit event, and keeps history immutable.
-- Error messages start with FH_ so the app can show a friendly Kannada/English message.

-- ---------- internal helpers (not callable by clients) ----------
create or replace function public.fh_uid() returns uuid language plpgsql stable as $$
declare u uuid := auth.uid();
begin if u is null then raise exception 'FH_NOT_SIGNED_IN'; end if; return u; end $$;

create or replace function public.fh_require_member(pid uuid) returns uuid language plpgsql security definer set search_path = public as $$
declare m uuid;
begin
  select id into m from project_members where project_id = pid and user_id = fh_uid() and status = 'active';
  if m is null then raise exception 'FH_NOT_MEMBER'; end if;
  return m;
end $$;

create or replace function public.fh_require_admin(pid uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  perform fh_require_member(pid);
  if not exists (select 1 from project_members where project_id = pid and user_id = fh_uid() and status = 'active' and is_admin) then
    raise exception 'FH_NOT_ADMIN';
  end if;
end $$;

create or replace function public.fh_require_unlocked(pid uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from settlements where project_id = pid and status in ('pending_confirmation','final')) then
    raise exception 'FH_PROJECT_LOCKED';
  end if;
end $$;

create or replace function public.fh_audit(pid uuid, etype text, eid uuid, act text, b jsonb, a jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_events (project_id, actor, entity_type, entity_id, action, before, after) values (pid, auth.uid(), etype, eid, act, b, a);
  update projects set last_activity_at = now() where id = pid;
end $$;

create or replace function public.fh_agreement_check(aid uuid) returns void language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  select project_id into pid from agreement_versions where id = aid;
  if not exists (
    select 1 from project_members m where m.project_id = pid and m.status = 'active'
      and not exists (select 1 from agreement_approvals a where a.agreement_id = aid and a.user_id = m.user_id)
  ) then
    update agreement_versions set status = 'superseded' where project_id = pid and status = 'approved' and id <> aid;
    update agreement_versions set status = 'approved', approved_at = now() where id = aid and status = 'proposed';
    perform fh_audit(pid, 'agreement', aid, 'approved', null, null);
  end if;
end $$;

create or replace function public.fh_supersede_agreements(pid uuid) returns void language plpgsql security definer set search_path = public as $$
begin update agreement_versions set status = 'superseded' where project_id = pid and status in ('proposed','approved'); end $$;

-- ---------- projects & members ----------
create or replace function public.create_project(
  p_name text, p_crop text, p_season text, p_village text, p_area numeric, p_unit text, p_role text, p_display_name text
) returns uuid language plpgsql security definer set search_path = public as $$
declare pid uuid; uid uuid := fh_uid(); mid uuid;
begin
  insert into projects (name, crop_name, season, village, land_area, land_area_unit, created_by)
  values (btrim(p_name), btrim(p_crop), btrim(p_season), nullif(btrim(coalesce(p_village,'')),''), p_area, p_unit, uid)
  returning id into pid;
  insert into project_members (project_id, user_id, role, is_admin, display_name) values (pid, uid, p_role, true, btrim(p_display_name)) returning id into mid;
  perform fh_audit(pid, 'project', pid, 'created', null, jsonb_build_object('name', p_name, 'crop', p_crop, 'season', p_season));
  return pid;
end $$;

create or replace function public.create_invitation(p_project uuid, p_role text) returns text language plpgsql security definer set search_path = public as $$
declare tok text := encode(gen_random_bytes(24), 'hex');
begin
  perform fh_require_admin(p_project);
  perform fh_require_unlocked(p_project);
  insert into invitations (project_id, role, token_hash, invited_by, expires_at)
  values (p_project, p_role, encode(digest(tok, 'sha256'), 'hex'), fh_uid(), now() + interval '7 days');
  perform fh_audit(p_project, 'invitation', null, 'created', null, jsonb_build_object('role', p_role));
  return tok;
end $$;

create or replace function public.revoke_invitation(p_invitation uuid) returns void language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  select project_id into pid from invitations where id = p_invitation;
  perform fh_require_admin(pid);
  update invitations set revoked_at = now() where id = p_invitation and accepted_at is null;
  perform fh_audit(pid, 'invitation', p_invitation, 'revoked', null, null);
end $$;

-- A single generic error for every invalid/expired/used token so tokens cannot be probed.
create or replace function public.accept_invitation(p_token text, p_display_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv invitations%rowtype; uid uuid := fh_uid();
begin
  select * into inv from invitations where token_hash = encode(digest(p_token, 'sha256'), 'hex') for update;
  if not found or inv.accepted_at is not null or inv.revoked_at is not null or inv.expires_at < now() then
    raise exception 'FH_INVITE_INVALID';
  end if;
  perform fh_require_unlocked(inv.project_id);
  insert into project_members (project_id, user_id, role, display_name)
  values (inv.project_id, uid, inv.role, btrim(p_display_name))
  on conflict (project_id, user_id) do update set status = 'active', removed_at = null, role = excluded.role, display_name = excluded.display_name;
  update invitations set accepted_by = uid, accepted_at = now() where id = inv.id;
  perform fh_supersede_agreements(inv.project_id);   -- terms must be re-agreed with the new member
  perform fh_audit(inv.project_id, 'member', null, 'joined', null, jsonb_build_object('user', uid, 'role', inv.role));
  return inv.project_id;
end $$;

create or replace function public.remove_member(p_member uuid) returns void language plpgsql security definer set search_path = public as $$
declare m project_members%rowtype; uid uuid := fh_uid();
begin
  select * into m from project_members where id = p_member for update;
  if not found then raise exception 'FH_NOT_FOUND'; end if;
  perform fh_require_member(m.project_id);
  if m.user_id <> uid then perform fh_require_admin(m.project_id); end if;
  perform fh_require_unlocked(m.project_id);
  if m.is_admin and not exists (select 1 from project_members where project_id = m.project_id and status = 'active' and is_admin and id <> m.id) then
    raise exception 'FH_LAST_ADMIN';
  end if;
  update project_members set status = 'removed', removed_at = now() where id = p_member;
  perform fh_supersede_agreements(m.project_id);
  perform fh_audit(m.project_id, 'member', p_member, 'removed', null, null);
end $$;

create or replace function public.set_approval_policy(p_project uuid, p_policy text) returns void language plpgsql security definer set search_path = public as $$
begin
  perform fh_require_admin(p_project);
  perform fh_require_unlocked(p_project);
  if p_policy not in ('notify_only','require_confirmation') then raise exception 'FH_INVALID'; end if;
  update projects set approval_policy = p_policy where id = p_project;
  perform fh_audit(p_project, 'project', p_project, 'approval_policy', null, jsonb_build_object('policy', p_policy));
end $$;

create or replace function public.set_project_status(p_project uuid, p_status text) returns void language plpgsql security definer set search_path = public as $$
begin
  perform fh_require_admin(p_project);
  perform fh_require_unlocked(p_project);
  if p_status not in ('active','harvesting','archived') then raise exception 'FH_INVALID'; end if;
  update projects set status = p_status where id = p_project;
  perform fh_audit(p_project, 'project', p_project, 'status', null, jsonb_build_object('status', p_status));
end $$;

-- ---------- agreements ----------
create or replace function public.propose_agreement(p_project uuid, p_shares jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare aid uuid; v int; uid uuid := fh_uid(); s jsonb; n int;
begin
  perform fh_require_member(p_project);
  perform fh_require_unlocked(p_project);
  if jsonb_typeof(p_shares) <> 'array' or jsonb_array_length(p_shares) = 0 then raise exception 'FH_INVALID'; end if;
  if (select coalesce(sum((x->>'expense_bps')::int),0) from jsonb_array_elements(p_shares) x) <> 10000
     or (select coalesce(sum((x->>'profit_bps')::int),0) from jsonb_array_elements(p_shares) x) <> 10000 then
    raise exception 'FH_SHARES_NOT_100';
  end if;
  if exists (select 1 from jsonb_array_elements(p_shares) x where (x->>'expense_bps')::int < 0 or (x->>'profit_bps')::int < 0) then
    raise exception 'FH_INVALID';
  end if;
  select count(distinct x->>'member_id') into n from jsonb_array_elements(p_shares) x;
  if n <> jsonb_array_length(p_shares) then raise exception 'FH_INVALID'; end if;
  if exists (select 1 from jsonb_array_elements(p_shares) x where not exists (
      select 1 from project_members m where m.id = (x->>'member_id')::uuid and m.project_id = p_project)) then
    raise exception 'FH_INVALID';
  end if;
  if exists (select 1 from project_members m where m.project_id = p_project and m.status = 'active'
      and not exists (select 1 from jsonb_array_elements(p_shares) x where (x->>'member_id')::uuid = m.id)) then
    raise exception 'FH_TERMS_INCOMPLETE';
  end if;
  select coalesce(max(version),0) + 1 into v from agreement_versions where project_id = p_project;
  update agreement_versions set status = 'superseded' where project_id = p_project and status = 'proposed';
  insert into agreement_versions (project_id, version, created_by) values (p_project, v, uid) returning id into aid;
  for s in select * from jsonb_array_elements(p_shares) loop
    insert into agreement_shares (agreement_id, member_id, expense_bps, profit_bps)
    values (aid, (s->>'member_id')::uuid, (s->>'expense_bps')::int, (s->>'profit_bps')::int);
  end loop;
  insert into agreement_approvals (agreement_id, user_id) values (aid, uid);
  perform fh_audit(p_project, 'agreement', aid, 'proposed', null, p_shares);
  perform fh_agreement_check(aid);
  return aid;
end $$;

create or replace function public.approve_agreement(p_agreement uuid) returns void language plpgsql security definer set search_path = public as $$
declare a agreement_versions%rowtype;
begin
  select * into a from agreement_versions where id = p_agreement;
  if not found then raise exception 'FH_NOT_FOUND'; end if;
  perform fh_require_member(a.project_id);
  perform fh_require_unlocked(a.project_id);
  if a.status <> 'proposed' then raise exception 'FH_INVALID'; end if;
  insert into agreement_approvals (agreement_id, user_id) values (p_agreement, fh_uid()) on conflict do nothing;
  perform fh_audit(a.project_id, 'agreement', p_agreement, 'approval_given', null, null);
  perform fh_agreement_check(p_agreement);
end $$;

-- ---------- expenses ----------
create or replace function public.add_expense(
  p_project uuid, p_client_id uuid, p_amount bigint, p_category text, p_paid_by uuid, p_date date,
  p_description text, p_payment_method text, p_notes text
) returns uuid language plpgsql security definer set search_path = public as $$
declare eid uuid; uid uuid := fh_uid();
begin
  perform fh_require_member(p_project);
  perform fh_require_unlocked(p_project);
  if p_amount is null or p_amount <= 0 then raise exception 'FH_INVALID_AMOUNT'; end if;
  if p_date is null or p_date > current_date + 1 then raise exception 'FH_INVALID_DATE'; end if;
  if not exists (select 1 from project_members where id = p_paid_by and project_id = p_project and status = 'active') then
    raise exception 'FH_INVALID_PAYER';
  end if;
  insert into expenses (project_id, client_id, amount_paise, category, paid_by, created_by, expense_date, description, payment_method, notes)
  values (p_project, p_client_id, p_amount, p_category, p_paid_by, uid, p_date, nullif(btrim(coalesce(p_description,'')),''), nullif(p_payment_method,''), nullif(btrim(coalesce(p_notes,'')),''))
  on conflict (project_id, client_id) do nothing
  returning id into eid;
  if eid is null then   -- same submission arrived twice: return the original, change nothing
    select id into eid from expenses where project_id = p_project and client_id = p_client_id;
    return eid;
  end if;
  insert into expense_status_history (expense_id, project_id, from_status, to_status, action, actor) values (eid, p_project, null, 'awaiting_review', 'created', uid);
  perform fh_audit(p_project, 'expense', eid, 'created', null, jsonb_build_object('amount_paise', p_amount, 'category', p_category, 'paid_by', p_paid_by, 'date', p_date));
  return eid;
end $$;

create or replace function public.amend_expense(
  p_expense uuid, p_amount bigint, p_category text, p_paid_by uuid, p_date date,
  p_description text, p_payment_method text, p_notes text, p_reason text
) returns void language plpgsql security definer set search_path = public as $$
declare e expenses%rowtype; uid uuid := fh_uid(); before_json jsonb;
begin
  select * into e from expenses where id = p_expense for update;
  if not found then raise exception 'FH_NOT_FOUND'; end if;
  perform fh_require_member(e.project_id);
  perform fh_require_unlocked(e.project_id);
  if e.status = 'reversed' then raise exception 'FH_EXPENSE_REVERSED'; end if;
  if not (e.created_by = uid or public.is_admin(e.project_id)
          or exists (select 1 from project_members where id = e.paid_by and user_id = uid)) then
    raise exception 'FH_NOT_ALLOWED';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then raise exception 'FH_REASON_REQUIRED'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'FH_INVALID_AMOUNT'; end if;
  if p_date is null or p_date > current_date + 1 then raise exception 'FH_INVALID_DATE'; end if;
  if not exists (select 1 from project_members where id = p_paid_by and project_id = e.project_id and (status = 'active' or id = e.paid_by)) then
    raise exception 'FH_INVALID_PAYER';
  end if;
  before_json := jsonb_build_object('amount_paise', e.amount_paise, 'category', e.category, 'paid_by', e.paid_by, 'date', e.expense_date,
                                   'description', e.description, 'payment_method', e.payment_method, 'notes', e.notes, 'status', e.status);
  update expenses set amount_paise = p_amount, category = p_category, paid_by = p_paid_by, expense_date = p_date,
    description = nullif(btrim(coalesce(p_description,'')),''), payment_method = nullif(p_payment_method,''),
    notes = nullif(btrim(coalesce(p_notes,'')),''), status = 'awaiting_review'
  where id = p_expense;
  insert into expense_status_history (expense_id, project_id, from_status, to_status, action, note, actor)
  values (p_expense, e.project_id, e.status, 'awaiting_review', 'amended', btrim(p_reason), uid);
  perform fh_audit(e.project_id, 'expense', p_expense, 'amended', before_json,
    jsonb_build_object('amount_paise', p_amount, 'category', p_category, 'paid_by', p_paid_by, 'date', p_date, 'reason', btrim(p_reason)));
end $$;

create or replace function public.review_expense(p_expense uuid, p_action text, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare e expenses%rowtype; uid uuid := fh_uid(); newstatus text; active_count int;
begin
  select * into e from expenses where id = p_expense for update;
  if not found then raise exception 'FH_NOT_FOUND'; end if;
  perform fh_require_member(e.project_id);
  perform fh_require_unlocked(e.project_id);
  if e.status = 'reversed' then raise exception 'FH_EXPENSE_REVERSED'; end if;
  select count(*) into active_count from project_members where project_id = e.project_id and status = 'active';
  if p_action = 'confirm' then
    if e.status <> 'awaiting_review' then raise exception 'FH_INVALID'; end if;
    if e.created_by = uid and active_count > 1 then raise exception 'FH_OWN_EXPENSE'; end if;
    newstatus := 'confirmed';
  elsif p_action = 'dispute' then
    if e.status not in ('awaiting_review','confirmed','resolved') then raise exception 'FH_INVALID'; end if;
    if e.created_by = uid and active_count > 1 then raise exception 'FH_OWN_EXPENSE'; end if;
    newstatus := 'disputed';
  elsif p_action = 'resolve' then
    if e.status <> 'disputed' then raise exception 'FH_INVALID'; end if;
    if p_note is null or char_length(btrim(p_note)) < 3 then raise exception 'FH_REASON_REQUIRED'; end if;
    newstatus := 'resolved';
  else
    raise exception 'FH_INVALID';
  end if;
  update expenses set status = newstatus where id = p_expense;
  insert into expense_status_history (expense_id, project_id, from_status, to_status, action, note, actor)
  values (p_expense, e.project_id, e.status, newstatus, p_action, nullif(btrim(coalesce(p_note,'')),''), uid);
  perform fh_audit(e.project_id, 'expense', p_expense, p_action, jsonb_build_object('status', e.status), jsonb_build_object('status', newstatus, 'note', p_note));
end $$;

create or replace function public.reverse_expense(p_expense uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare e expenses%rowtype; uid uuid := fh_uid();
begin
  select * into e from expenses where id = p_expense for update;
  if not found then raise exception 'FH_NOT_FOUND'; end if;
  perform fh_require_member(e.project_id);
  perform fh_require_unlocked(e.project_id);
  if e.status = 'reversed' then raise exception 'FH_EXPENSE_REVERSED'; end if;
  if not (e.created_by = uid or public.is_admin(e.project_id)) then raise exception 'FH_NOT_ALLOWED'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then raise exception 'FH_REASON_REQUIRED'; end if;
  update expenses set status = 'reversed', reversed_at = now(), reversed_by = uid, reversal_reason = btrim(p_reason) where id = p_expense;
  insert into expense_status_history (expense_id, project_id, from_status, to_status, action, note, actor)
  values (p_expense, e.project_id, e.status, 'reversed', 'reversed', btrim(p_reason), uid);
  perform fh_audit(e.project_id, 'expense', p_expense, 'reversed', jsonb_build_object('status', e.status, 'amount_paise', e.amount_paise), jsonb_build_object('reason', btrim(p_reason)));
end $$;

-- ---------- income ----------
create or replace function public.add_income(
  p_project uuid, p_client_id uuid, p_kind text, p_amount bigint, p_date date, p_buyer text, p_quantity numeric,
  p_unit text, p_unit_price bigint, p_payment_status text, p_received_by uuid, p_payment_details text, p_notes text
) returns uuid language plpgsql security definer set search_path = public as $$
declare iid uuid; uid uuid := fh_uid(); holder uuid := p_received_by;
begin
  perform fh_require_member(p_project);
  perform fh_require_unlocked(p_project);
  if p_amount is null or p_amount = 0 then raise exception 'FH_INVALID_AMOUNT'; end if;
  if p_kind <> 'adjustment' and p_amount < 0 then raise exception 'FH_INVALID_AMOUNT'; end if;
  if p_kind = 'adjustment' and (p_notes is null or char_length(btrim(p_notes)) < 3) then raise exception 'FH_REASON_REQUIRED'; end if;
  if p_date is null or p_date > current_date + 1 then raise exception 'FH_INVALID_DATE'; end if;
  if p_payment_status = 'pending' then holder := null; end if;
  if holder is not null and not exists (select 1 from project_members where id = holder and project_id = p_project and status = 'active') then
    raise exception 'FH_INVALID_PAYER';
  end if;
  insert into incomes (project_id, client_id, kind, amount_paise, income_date, buyer, quantity, quantity_unit, unit_price_paise,
                       payment_status, received_by, payment_details, notes, created_by)
  values (p_project, p_client_id, p_kind, p_amount, p_date, nullif(btrim(coalesce(p_buyer,'')),''), p_quantity, nullif(p_unit,''), p_unit_price,
          p_payment_status, holder, nullif(btrim(coalesce(p_payment_details,'')),''), nullif(btrim(coalesce(p_notes,'')),''), uid)
  on conflict (project_id, client_id) do nothing
  returning id into iid;
  if iid is null then
    select id into iid from incomes where project_id = p_project and client_id = p_client_id;
    return iid;
  end if;
  perform fh_audit(p_project, 'income', iid, 'created', null, jsonb_build_object('kind', p_kind, 'amount_paise', p_amount, 'payment_status', p_payment_status));
  return iid;
end $$;

create or replace function public.mark_income_received(p_income uuid, p_received_by uuid) returns void
language plpgsql security definer set search_path = public as $$
declare i incomes%rowtype;
begin
  select * into i from incomes where id = p_income for update;
  if not found then raise exception 'FH_NOT_FOUND'; end if;
  perform fh_require_member(i.project_id);
  perform fh_require_unlocked(i.project_id);
  if i.status <> 'active' or i.payment_status <> 'pending' then raise exception 'FH_INVALID'; end if;
  if not exists (select 1 from project_members where id = p_received_by and project_id = i.project_id and status = 'active') then raise exception 'FH_INVALID_PAYER'; end if;
  update incomes set payment_status = 'received', received_by = p_received_by where id = p_income;
  perform fh_audit(i.project_id, 'income', p_income, 'marked_received', jsonb_build_object('payment_status', 'pending'), jsonb_build_object('payment_status', 'received', 'received_by', p_received_by));
end $$;

create or replace function public.reverse_income(p_income uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare i incomes%rowtype; uid uuid := fh_uid();
begin
  select * into i from incomes where id = p_income for update;
  if not found then raise exception 'FH_NOT_FOUND'; end if;
  perform fh_require_member(i.project_id);
  perform fh_require_unlocked(i.project_id);
  if i.status = 'reversed' then raise exception 'FH_INVALID'; end if;
  if not (i.created_by = uid or public.is_admin(i.project_id)) then raise exception 'FH_NOT_ALLOWED'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then raise exception 'FH_REASON_REQUIRED'; end if;
  update incomes set status = 'reversed', reversed_at = now(), reversed_by = uid, reversal_reason = btrim(p_reason) where id = p_income;
  perform fh_audit(i.project_id, 'income', p_income, 'reversed', jsonb_build_object('amount_paise', i.amount_paise), jsonb_build_object('reason', btrim(p_reason)));
end $$;

-- ---------- payments between partners ----------
create or replace function public.record_payment(
  p_project uuid, p_client_id uuid, p_from uuid, p_to uuid, p_amount bigint, p_date date, p_method text, p_note text
) returns uuid language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  perform fh_require_member(p_project);
  perform fh_require_unlocked(p_project);
  if p_amount is null or p_amount <= 0 then raise exception 'FH_INVALID_AMOUNT'; end if;
  if p_from = p_to then raise exception 'FH_INVALID_PAYER'; end if;
  if (select count(*) from project_members where project_id = p_project and id in (p_from, p_to)) <> 2 then raise exception 'FH_INVALID_PAYER'; end if;
  insert into payments (project_id, client_id, from_member, to_member, amount_paise, paid_on, method, note, created_by)
  values (p_project, p_client_id, p_from, p_to, p_amount, p_date, nullif(p_method,''), nullif(btrim(coalesce(p_note,'')),''), fh_uid())
  on conflict (project_id, client_id) do nothing returning id into pid;
  if pid is null then select id into pid from payments where project_id = p_project and client_id = p_client_id; return pid; end if;
  perform fh_audit(p_project, 'payment', pid, 'created', null, jsonb_build_object('from', p_from, 'to', p_to, 'amount_paise', p_amount));
  return pid;
end $$;

create or replace function public.reverse_payment(p_payment uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare p payments%rowtype;
begin
  select * into p from payments where id = p_payment for update;
  if not found then raise exception 'FH_NOT_FOUND'; end if;
  perform fh_require_member(p.project_id);
  perform fh_require_unlocked(p.project_id);
  if p.status = 'reversed' then raise exception 'FH_INVALID'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then raise exception 'FH_REASON_REQUIRED'; end if;
  update payments set status = 'reversed', reversed_at = now(), reversal_reason = btrim(p_reason) where id = p_payment;
  perform fh_audit(p.project_id, 'payment', p_payment, 'reversed', jsonb_build_object('amount_paise', p.amount_paise), jsonb_build_object('reason', btrim(p_reason)));
end $$;

-- ---------- attachments ----------
create or replace function public.add_attachment(p_entity_type text, p_entity_id uuid, p_path text, p_mime text, p_size int) returns uuid
language plpgsql security definer set search_path = public as $$
declare pid uuid; aid uuid;
begin
  if p_entity_type = 'expense' then select project_id into pid from expenses where id = p_entity_id;
  elsif p_entity_type = 'income' then select project_id into pid from incomes where id = p_entity_id;
  else raise exception 'FH_INVALID'; end if;
  if pid is null then raise exception 'FH_NOT_FOUND'; end if;
  perform fh_require_member(pid);
  if split_part(p_path, '/', 1) <> pid::text or split_part(p_path, '/', 2) <> p_entity_id::text then raise exception 'FH_INVALID'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'receipts' and name = p_path) then raise exception 'FH_UPLOAD_MISSING'; end if;
  insert into attachments (project_id, entity_type, entity_id, storage_path, mime_type, size_bytes, uploaded_by)
  values (pid, p_entity_type, p_entity_id, p_path, p_mime, p_size, fh_uid()) returning id into aid;
  perform fh_audit(pid, 'attachment', aid, 'added', null, jsonb_build_object('entity', p_entity_type, 'entity_id', p_entity_id));
  return aid;
end $$;

create or replace function public.remove_attachment(p_attachment uuid) returns void language plpgsql security definer set search_path = public as $$
declare a attachments%rowtype; uid uuid := fh_uid();
begin
  select * into a from attachments where id = p_attachment for update;
  if not found or a.removed_at is not null then raise exception 'FH_NOT_FOUND'; end if;
  perform fh_require_member(a.project_id);
  if not (a.uploaded_by = uid or public.is_admin(a.project_id)) then raise exception 'FH_NOT_ALLOWED'; end if;
  update attachments set removed_at = now(), removed_by = uid where id = p_attachment;
  perform fh_audit(a.project_id, 'attachment', p_attachment, 'removed', null, null);
end $$;

-- ---------- settlements ----------
create or replace function public.create_settlement(p_project uuid, p_basis text, p_snapshot jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare ag uuid; v int; sid uuid; policy text; db_exp bigint; db_inc bigint;
begin
  perform fh_require_member(p_project);
  perform fh_require_unlocked(p_project);
  if p_basis not in ('received','recorded') then raise exception 'FH_INVALID'; end if;
  select approval_policy into policy from projects where id = p_project;
  select id into ag from agreement_versions where project_id = p_project and status = 'approved';
  if ag is null then raise exception 'FH_NO_AGREEMENT'; end if;

  if exists (select 1 from expenses e where e.project_id = p_project and e.status <> 'reversed'
             and not exists (select 1 from agreement_shares s where s.agreement_id = ag and s.member_id = e.paid_by))
     or exists (select 1 from incomes i where i.project_id = p_project and i.status = 'active' and i.received_by is not null
             and not exists (select 1 from agreement_shares s where s.agreement_id = ag and s.member_id = i.received_by))
     or exists (select 1 from payments p where p.project_id = p_project and p.status = 'active'
             and (not exists (select 1 from agreement_shares s where s.agreement_id = ag and s.member_id = p.from_member)
               or not exists (select 1 from agreement_shares s where s.agreement_id = ag and s.member_id = p.to_member))) then
    raise exception 'FH_TERMS_INCOMPLETE';
  end if;

  if not exists (select 1 from expenses where project_id = p_project and status <> 'reversed')
     and not exists (select 1 from incomes where project_id = p_project and status = 'active') then raise exception 'FH_NO_RECORDS'; end if;
  if exists (select 1 from expenses where project_id = p_project and status = 'disputed') then raise exception 'FH_HAS_DISPUTES'; end if;
  if policy = 'require_confirmation' and exists (select 1 from expenses where project_id = p_project and status = 'awaiting_review') then raise exception 'FH_AWAITING_REVIEW'; end if;
  if exists (select 1 from incomes where project_id = p_project and status = 'active' and payment_status = 'pending') then raise exception 'FH_PENDING_INCOME'; end if;
  if (select coalesce(sum(amount_paise),0) from incomes where project_id = p_project and status = 'active' and payment_status = 'received' and received_by is null) <> 0 then
    raise exception 'FH_UNASSIGNED_CASH';
  end if;

  select coalesce(sum(amount_paise),0) into db_exp from expenses where project_id = p_project and status <> 'reversed';
  select coalesce(sum(amount_paise),0) into db_inc from incomes
    where project_id = p_project and status = 'active' and (p_basis = 'recorded' or payment_status = 'received');
  if (p_snapshot->'result'->>'totalExpensesPaise')::bigint <> db_exp
     or (p_snapshot->'result'->>'totalIncomePaise')::bigint <> db_inc
     or (p_snapshot->'result'->>'provisional')::boolean is distinct from false
     or (p_snapshot->'result'->>'reconciles')::boolean is distinct from true
     or jsonb_array_length(p_snapshot->'input'->'members') <> (select count(*) from agreement_shares where agreement_id = ag)
     or exists (select 1 from jsonb_array_elements(p_snapshot->'input'->'members') m where not exists (
          select 1 from agreement_shares s where s.agreement_id = ag and s.member_id = (m->>'memberId')::uuid
            and s.expense_bps = (m->>'expenseBps')::int and s.profit_bps = (m->>'profitBps')::int)) then
    raise exception 'FH_SNAPSHOT_MISMATCH';
  end if;

  select coalesce(max(version),0) + 1 into v from settlements where project_id = p_project;
  insert into settlements (project_id, version, basis, agreement_id, snapshot, snapshot_hash, created_by)
  values (p_project, v, p_basis, ag, p_snapshot, encode(digest(p_snapshot::text, 'sha256'), 'hex'), fh_uid())
  returning id into sid;
  perform fh_audit(p_project, 'settlement', sid, 'created', null, jsonb_build_object('version', v, 'basis', p_basis));
  return sid;
end $$;

create or replace function public.confirm_settlement(p_settlement uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s settlements%rowtype; uid uuid := fh_uid();
begin
  select * into s from settlements where id = p_settlement for update;
  if not found then raise exception 'FH_NOT_FOUND'; end if;
  perform fh_require_member(s.project_id);
  if s.status <> 'pending_confirmation' then raise exception 'FH_INVALID'; end if;
  insert into settlement_confirmations (settlement_id, user_id, agreement_id) values (p_settlement, uid, s.agreement_id) on conflict do nothing;
  perform fh_audit(s.project_id, 'settlement', p_settlement, 'confirmed', null, null);
  if not exists (
    select 1 from project_members m where m.project_id = s.project_id and m.status = 'active'
      and not exists (select 1 from settlement_confirmations c where c.settlement_id = p_settlement and c.user_id = m.user_id)
  ) then
    update settlements set status = 'final', finalized_at = now() where id = p_settlement;
    update projects set status = 'settled' where id = s.project_id;
    perform fh_audit(s.project_id, 'settlement', p_settlement, 'finalized', null, null);
  end if;
end $$;

create or replace function public.amend_settlement(p_settlement uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare s settlements%rowtype; uid uuid := fh_uid();
begin
  select * into s from settlements where id = p_settlement for update;
  if not found then raise exception 'FH_NOT_FOUND'; end if;
  perform fh_require_member(s.project_id);
  if s.status not in ('pending_confirmation','final') then raise exception 'FH_INVALID'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then raise exception 'FH_REASON_REQUIRED'; end if;
  insert into settlement_amendments (project_id, settlement_id, reason, requested_by) values (s.project_id, p_settlement, btrim(p_reason), uid);
  update settlements set status = case when s.status = 'final' then 'superseded' else 'void' end where id = p_settlement;
  update projects set status = 'harvesting' where id = s.project_id and status = 'settled';
  perform fh_audit(s.project_id, 'settlement', p_settlement, 'amended', jsonb_build_object('status', s.status), jsonb_build_object('reason', btrim(p_reason)));
end $$;

-- ---------- privileges: only the public API functions are callable by signed-in users ----------
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    if r.proname in ('create_project','create_invitation','revoke_invitation','accept_invitation','remove_member','set_approval_policy','set_project_status',
        'propose_agreement','approve_agreement','add_expense','amend_expense','review_expense','reverse_expense','add_income','mark_income_received',
        'reverse_income','record_payment','reverse_payment','add_attachment','remove_attachment','create_settlement','confirm_settlement','amend_settlement',
        'is_member','is_admin') then
      execute format('grant execute on function %s to authenticated', r.sig);
    end if;
  end loop;
end $$;
