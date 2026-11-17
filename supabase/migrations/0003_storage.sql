-- 원본 파일 보관소. 비공개 버킷, 경로 첫 폴더 = 내 사용자 id
--   {owner_id}/{record_id}/{version}/{파일명}
insert into storage.buckets (id, name, public, file_size_limit)
values ('records', 'records', false, 20971520)   -- 20MB
on conflict (id) do nothing;

create policy records_select on storage.objects for select to authenticated
  using (bucket_id = 'records' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy records_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'records' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy records_update on storage.objects for update to authenticated
  using (bucket_id = 'records' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy records_delete on storage.objects for delete to authenticated
  using (bucket_id = 'records' and (storage.foldername(name))[1] = (select auth.uid())::text);
