-- Guest access uses a browser-generated 256-bit capability. Only its hash is stored.
-- Existing account-owned files are preserved, but not exposed to guest browsers.
alter table public.files alter column owner_id drop not null;
alter table public.files add column owner_key text check(owner_key ~ '^[a-f0-9]{64}$');
create index files_guest_owner on public.files(owner_key,created_at);
-- All management now goes through the Edge Function; no direct client listing.
drop policy if exists "Owners can read their metadata" on public.files;
revoke select on public.files from authenticated;
grant execute on function public.storage_usage() to anon;
drop function public.reserve_upload(uuid,text,bigint);

create function public.reserve_guest_upload(p_owner text,p_name text,p_size bigint) returns public.files
language plpgsql security definer set search_path=public as $$
declare result files;
begin
 perform pg_advisory_xact_lock(8002026);
 if p_owner !~ '^[a-f0-9]{64}$' then raise exception 'Invalid browser key'; end if;
 if p_size < 1 or p_size > 20000000 then raise exception 'File must be between 1 byte and 20 MB'; end if;
 if (select count(*) from files where owner_key=p_owner and created_at>now()-interval '1 hour') >= 10 then
  raise exception 'Upload limit reached. Try again later.';
 end if;
 if (select coalesce(sum(case when created_at>now()-interval '3 hours' then 20000000 else size end),0) from files)+20000000>800000000 then
  raise exception 'Storage is full. Please retry shortly.';
 end if;
 insert into files(owner_key,name,path,size,expected_size)
 values(p_owner,p_name,gen_random_uuid()::text||'/'||gen_random_uuid()::text,20000000,p_size) returning * into result;
 return result;
end $$;
revoke all on function public.reserve_guest_upload(text,text,bigint) from public,anon,authenticated;
grant execute on function public.reserve_guest_upload(text,text,bigint) to service_role;
