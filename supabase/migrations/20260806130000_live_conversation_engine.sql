alter table public.support_tickets
  add column if not exists conversation_state text not null default 'bot_active',
  add column if not exists conversation_summary text not null default '',
  add column if not exists manager_joined_at timestamptz,
  add column if not exists first_response_at timestamptz,
  add column if not exists last_seen_at timestamptz,
  add column if not exists last_typing_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'support_tickets_conversation_state_check'
      and conrelid = 'public.support_tickets'::regclass
  ) then
    alter table public.support_tickets
      add constraint support_tickets_conversation_state_check
      check (conversation_state in ('bot_active','waiting_manager','manager_active','resolved','closed'));
  end if;
end;
$$;

update public.support_tickets
set conversation_state = case
  when status = 'pending_confirmation' then 'bot_active'
  when status = 'resolved' then 'resolved'
  when status in ('closed', 'cancelled') then 'closed'
  when status in ('assigned', 'in_progress', 'waiting_for_client') and assigned_to is not null then 'manager_active'
  else 'waiting_manager'
end
where conversation_state = 'bot_active';

alter table public.support_messages
  add column if not exists message_type text not null default 'text',
  add column if not exists source text not null default 'web',
  add column if not exists attachment_metadata jsonb not null default '{}'::jsonb,
  add column if not exists telegram_message_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'support_messages_type_check'
      and conrelid = 'public.support_messages'::regclass
  ) then
    alter table public.support_messages
      add constraint support_messages_type_check
      check (message_type in ('text','image','pdf','voice','system','telegram','internal_note'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'support_messages_source_check'
      and conrelid = 'public.support_messages'::regclass
  ) then
    alter table public.support_messages
      add constraint support_messages_source_check
      check (source in ('web','telegram','system'));
  end if;
end;
$$;

create table if not exists public.support_telegram_link_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.support_telegram_bindings (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  telegram_user_id text not null,
  telegram_chat_id text not null,
  linked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id),
  unique (organization_id, user_id)
);

create index if not exists idx_support_tickets_conversation_state
  on public.support_tickets (organization_id, conversation_state, updated_at desc);
create index if not exists idx_support_messages_conversation_order
  on public.support_messages (ticket_id, created_at, id);
create index if not exists idx_support_link_tokens_expiry
  on public.support_telegram_link_tokens (token_hash, expires_at)
  where used_at is null;

comment on column public.support_tickets.conversation_state is 'Live conversation state layered on the existing support ticket root.';
comment on column public.support_messages.attachment_metadata is 'Reserved for validated attachment descriptors; never stores secrets.';