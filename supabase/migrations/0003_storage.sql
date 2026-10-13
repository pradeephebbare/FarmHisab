-- Private bucket for receipts and sale documents. Path layout: <project_id>/<entity_id>/<file>.
-- Size and type limits are enforced by Storage itself (server-side), not just in the browser.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic'];

create policy receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and public.is_member(public.safe_uuid(split_part(name, '/', 1))));
create policy receipts_select on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.is_member(public.safe_uuid(split_part(name, '/', 1))));
-- No update/delete policies: files are never overwritten or deleted by clients; removal is recorded in `attachments`.
grant execute on function public.safe_uuid(text) to authenticated;
