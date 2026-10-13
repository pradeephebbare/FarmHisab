alter table public.expenses
  add column expense_for text not null default 'landowner'
  check (expense_for in ('landowner', 'farmer'));

update public.project_members m
set role = 'landowner'
from public.projects p
where m.project_id = p.id and m.user_id = p.created_by and m.status = 'active';

drop function public.add_expense(uuid, uuid, bigint, text, uuid, date, text, text, text);
create function public.add_expense(
  p_project uuid, p_client_id uuid, p_amount bigint, p_category text, p_expense_for text, p_paid_by uuid, p_date date,
  p_description text, p_payment_method text, p_notes text
) returns uuid language plpgsql security definer set search_path = public as $$
declare eid uuid; uid uuid := fh_uid();
begin
  perform fh_require_member(p_project);
  if not exists (
    select 1 from project_members
    where project_id = p_project and user_id = uid and status = 'active' and role = 'landowner'
  ) then
    raise exception 'FH_LANDOWNER_ONLY';
  end if;
  perform fh_require_unlocked(p_project);
  if p_amount is null or p_amount <= 0 then raise exception 'FH_INVALID_AMOUNT'; end if;
  if p_expense_for is null or p_expense_for not in ('landowner', 'farmer') then raise exception 'FH_INVALID'; end if;
  if p_date is null or p_date > current_date + 1 then raise exception 'FH_INVALID_DATE'; end if;
  if not exists (select 1 from project_members where id = p_paid_by and project_id = p_project and status = 'active') then
    raise exception 'FH_INVALID_PAYER';
  end if;
  insert into expenses (project_id, client_id, amount_paise, category, expense_for, paid_by, created_by, expense_date, description, payment_method, notes)
  values (p_project, p_client_id, p_amount, p_category, p_expense_for, p_paid_by, uid, p_date, nullif(btrim(coalesce(p_description,'')),''), nullif(p_payment_method,''), nullif(btrim(coalesce(p_notes,'')),''))
  on conflict (project_id, client_id) do nothing
  returning id into eid;
  if eid is null then
    select id into eid from expenses where project_id = p_project and client_id = p_client_id;
    return eid;
  end if;
  insert into expense_status_history (expense_id, project_id, from_status, to_status, action, actor) values (eid, p_project, null, 'awaiting_review', 'created', uid);
  perform fh_audit(p_project, 'expense', eid, 'created', null, jsonb_build_object('amount_paise', p_amount, 'category', p_category, 'expense_for', p_expense_for, 'paid_by', p_paid_by, 'date', p_date));
  return eid;
end $$;
revoke all on function public.add_expense(uuid, uuid, bigint, text, text, uuid, date, text, text, text) from public, anon, authenticated;
grant execute on function public.add_expense(uuid, uuid, bigint, text, text, uuid, date, text, text, text) to authenticated;

drop function public.amend_expense(uuid, bigint, text, uuid, date, text, text, text, text);
create function public.amend_expense(
  p_expense uuid, p_amount bigint, p_category text, p_expense_for text, p_paid_by uuid, p_date date,
  p_description text, p_payment_method text, p_notes text, p_reason text
) returns void language plpgsql security definer set search_path = public as $$
declare e expenses%rowtype; uid uuid := fh_uid(); before_json jsonb;
begin
  select * into e from expenses where id = p_expense for update;
  if not found then raise exception 'FH_NOT_FOUND'; end if;
  perform fh_require_member(e.project_id);
  if not exists (
    select 1 from project_members
    where project_id = e.project_id and user_id = uid and status = 'active' and role = 'landowner'
  ) then
    raise exception 'FH_LANDOWNER_ONLY';
  end if;
  perform fh_require_unlocked(e.project_id);
  if e.status = 'reversed' then raise exception 'FH_EXPENSE_REVERSED'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then raise exception 'FH_REASON_REQUIRED'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'FH_INVALID_AMOUNT'; end if;
  if p_expense_for is null or p_expense_for not in ('landowner', 'farmer') then raise exception 'FH_INVALID'; end if;
  if p_date is null or p_date > current_date + 1 then raise exception 'FH_INVALID_DATE'; end if;
  if not exists (select 1 from project_members where id = p_paid_by and project_id = e.project_id and (status = 'active' or id = e.paid_by)) then
    raise exception 'FH_INVALID_PAYER';
  end if;
  before_json := jsonb_build_object('amount_paise', e.amount_paise, 'category', e.category, 'expense_for', e.expense_for, 'paid_by', e.paid_by, 'date', e.expense_date,
                                   'description', e.description, 'payment_method', e.payment_method, 'notes', e.notes, 'status', e.status);
  update expenses set amount_paise = p_amount, category = p_category, expense_for = p_expense_for, paid_by = p_paid_by, expense_date = p_date,
    description = nullif(btrim(coalesce(p_description,'')),''), payment_method = nullif(p_payment_method,''),
    notes = nullif(btrim(coalesce(p_notes,'')),''), status = 'awaiting_review'
  where id = p_expense;
  insert into expense_status_history (expense_id, project_id, from_status, to_status, action, note, actor)
  values (p_expense, e.project_id, e.status, 'awaiting_review', 'amended', btrim(p_reason), uid);
  perform fh_audit(e.project_id, 'expense', p_expense, 'amended', before_json,
    jsonb_build_object('amount_paise', p_amount, 'category', p_category, 'expense_for', p_expense_for, 'paid_by', p_paid_by, 'date', p_date, 'reason', btrim(p_reason)));
end $$;
revoke all on function public.amend_expense(uuid, bigint, text, text, uuid, date, text, text, text, text) from public, anon, authenticated;
grant execute on function public.amend_expense(uuid, bigint, text, text, uuid, date, text, text, text, text) to authenticated;

revoke all on function public.create_invitation(uuid, text) from public, anon, authenticated;
revoke all on function public.accept_invitation(text, text) from public, anon, authenticated;