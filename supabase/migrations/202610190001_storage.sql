-- Decimal units: shared 800 MB quota; 20 MB maximum object.
create extension if not exists pgcrypto;
create table public.files (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (length(name) between 1 and 255),
 path text not null unique,
 size bigint not null check(size between 1 and 20000000),
 expected_size bigint not null check(expected_size between 1 and 20000000),
 status text not null default 'pending' check(status in ('pending','ready','deleting')),
 share_token text not null unique default encode(gen_random_bytes(24),'hex'),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '3 days'
);
create index files_cleanup on public.files(status,created_at);
alter table public.files enable row level security;
create policy "Owners can read their metadata" on public.files for select to authenticated using(owner_id=auth.uid());
revoke all on public.files from anon,authenticated;
grant select on public.files to authenticated;
insert into storage.buckets(id,name,public,file_size_limit) values('uploads','uploads',false,20000000) on conflict(id) do update set public=false,file_size_limit=20000000;
-- No client storage policies: only signed upload/download URLs can access objects.
create function public.storage_usage() returns bigint language sql security definer set search_path=public as $$ select coalesce(sum(case when created_at > now()-interval '3 hours' then 20000000 else size end),0)::bigint from files $$;
revoke all on function public.storage_usage() from public;
grant execute on function public.storage_usage() to authenticated;
create function public.resolve_share(token text) returns table(id uuid,name text,size bigint,expires_at timestamptz,share_token text) language sql security definer set search_path=public as $$ select id,name,size,expires_at,share_token from files where share_token=token and status='ready' and expires_at>now() $$;
revoke all on function public.resolve_share(text) from public;
grant execute on function public.resolve_share(text) to anon,authenticated;
-- This lock serializes reservations across every edge-function instance.
create function public.reserve_upload(p_owner uuid,p_name text,p_size bigint) returns public.files language plpgsql security definer set search_path=public as $$
declare result files; begin
 perform pg_advisory_xact_lock(8002026);
 if p_size < 1 or p_size > 20000000 then raise exception 'File must be between 1 byte and 20 MB'; end if;
 if (select count(*) from files where owner_id=p_owner and created_at>now()-interval '1 hour') >= 10 then raise exception 'Upload limit reached. Try again later.'; end if;
 if (select coalesce(sum(case when created_at > now()-interval '3 hours' then 20000000 else size end),0) from files)+20000000>800000000 then raise exception 'Storage is full. Please retry shortly.'; end if;
 insert into files(owner_id,name,path,size,expected_size) values(p_owner,p_name,p_owner::text||'/'||gen_random_uuid()::text,20000000,p_size) returning * into result;
 return result; end $$;
revoke all on function public.reserve_upload(uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.reserve_upload(uuid,text,bigint) to service_role;
