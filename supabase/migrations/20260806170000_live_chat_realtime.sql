create table if not exists public.support_realtime_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  public_number text not null,
  event_type text not null check (event_type in ('message','state')),
  conversation_state text,
  sender_type text,
  public_message text,
  message_type text,
  source text,
  created_at timestamptz not null default now(),
  constraint support_realtime_events_public_message_size_check
    check (public_message is null or length(public_message) <= 2000)
);

alter table public.support_realtime_events enable row level security;
create index if not exists idx_support_realtime_events_ticket_created
  on public.support_realtime_events (ticket_id, created_at desc);
create index if not exists idx_support_realtime_events_org_created
  on public.support_realtime_events (organization_id, created_at desc);
create index if not exists idx_support_realtime_events_public_number_created
  on public.support_realtime_events (public_number, created_at desc);

alter table public.support_realtime_events replica identity default;

create or replace function public.support_cleanup_realtime_events(
  retention_interval interval default interval '30 days'
)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  deleted_count integer;
begin
  if retention_interval < interval '1 day' or retention_interval > interval '365 days' then
    raise exception using message = 'retention interval must be between 1 and 365 days';
  end if;

  delete from public.support_realtime_events
  where created_at < now() - retention_interval;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on public.support_realtime_events from anon, authenticated;
grant select on public.support_realtime_events to authenticated;
revoke execute on function public.support_cleanup_realtime_events(interval) from public, anon, authenticated;
grant execute on function public.support_cleanup_realtime_events(interval) to service_role;

drop policy if exists support_realtime_events_client_select on public.support_realtime_events;
create policy support_realtime_events_client_select on public.support_realtime_events
  for select to authenticated using (
    exists (
      select 1 from public.support_tickets ticket
      where ticket.id = support_realtime_events.ticket_id
        and ticket.requester_user_id = auth.uid()
    )
  );

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication p
      join pg_publication_rel pr on pr.prpubid = p.oid
      join pg_class c on c.oid = pr.prrelid
      join pg_namespace n on n.oid = c.relnamespace
      where p.pubname = 'supabase_realtime'
        and n.nspname = 'public'
        and c.relname = 'support_realtime_events'
    ) then
    alter publication supabase_realtime add table public.support_realtime_events;
  end if;
end;
$$;
