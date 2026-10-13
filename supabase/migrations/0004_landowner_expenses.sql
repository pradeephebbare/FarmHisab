create or replace function public.add_expense(
  p_project uuid, p_client_id uuid, p_amount bigint, p_category text, p_paid_by uuid, p_date date,
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
  if p_date is null or p_date > current_date + 1 then raise exception 'FH_INVALID_DATE'; end if;
  if not exists (select 1 from project_members where id = p_paid_by and project_id = p_project and status = 'active') then
    raise exception 'FH_INVALID_PAYER';
  end if;
  insert into expenses (project_id, client_id, amount_paise, category, paid_by, created_by, expense_date, description, payment_method, notes)
  values (p_project, p_client_id, p_amount, p_category, p_paid_by, uid, p_date, nullif(btrim(coalesce(p_description,'')),''), nullif(p_payment_method,''), nullif(btrim(coalesce(p_notes,'')),''))
  on conflict (project_id, client_id) do nothing
  returning id into eid;
  if eid is null then
    select id into eid from expenses where project_id = p_project and client_id = p_client_id;
    return eid;
  end if;
  insert into expense_status_history (expense_id, project_id, from_status, to_status, action, actor) values (eid, p_project, null, 'awaiting_review', 'created', uid);
  perform fh_audit(p_project, 'expense', eid, 'created', null, jsonb_build_object('amount_paise', p_amount, 'category', p_category, 'paid_by', p_paid_by, 'date', p_date));
  return eid;
end $$;