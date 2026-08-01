-- Release 1.1: subscription foundation. Review and apply in a controlled environment only.
create table if not exists public.organization_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  country text not null default '',
  currency text not null default 'EUR',
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  plan_code text not null check (plan_code in ('starter', 'professional', 'business')),
  status text not null check (status in ('trialing', 'active', 'past_due', 'canceled', 'paused')),
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  payment_provider text not null default 'none',
  provider_customer_id text,
  provider_subscription_id text,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.organization_settings enable row level security;
alter table public.subscriptions enable row level security;

create or replace function public.is_org_owner(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members member
    where member.organization_id = target_org_id
      and member.user_id = auth.uid()
      and member.role_code = 'owner'
      and member.status = 'active'
  );
$$;

revoke all on function public.is_org_owner(uuid) from public;
grant execute on function public.is_org_owner(uuid) to authenticated;

create policy organization_settings_select on public.organization_settings
for select using (public.is_org_owner(organization_id));

create policy organization_settings_manage on public.organization_settings
for all using (public.is_org_owner(organization_id))
with check (public.is_org_owner(organization_id));

create policy subscriptions_select on public.subscriptions
for select using (public.is_org_owner(organization_id));

create policy subscriptions_manage on public.subscriptions
for update using (public.is_org_owner(organization_id))
with check (public.is_org_owner(organization_id));

create or replace function public.create_organization_onboarding(
  organization_name text,
  organization_slug text,
  selected_plan_code text,
  selected_country text,
  selected_currency text,
  selected_timezone text,
  trial_started timestamptz,
  trial_ends timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_organization_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select organization.id into new_organization_id
  from public.organizations organization
  where organization.slug = organization_slug
    and organization.owner_id = auth.uid()
  for update;

  if new_organization_id is null then
    insert into public.organizations (name, slug, owner_id)
    values (organization_name, organization_slug, auth.uid())
    on conflict (slug) do nothing
    returning id into new_organization_id;

    if new_organization_id is null then
      select organization.id into new_organization_id
      from public.organizations organization
      where organization.slug = organization_slug
        and organization.owner_id = auth.uid()
      for update;
    end if;
  end if;

  if new_organization_id is null then raise exception 'Organization slug is already owned by another user'; end if;

  insert into public.organization_members (organization_id, user_id, role_code, role, status)
  values (new_organization_id, auth.uid(), 'owner', 'owner', 'active')
  on conflict (organization_id, user_id) do update
    set role_code = 'owner', role = 'owner', status = 'active';
  insert into public.organization_settings (organization_id, country, currency, timezone)
  values (new_organization_id, coalesce(selected_country, ''), coalesce(selected_currency, 'EUR'), coalesce(selected_timezone, 'UTC'))
  on conflict (organization_id) do update
    set country = excluded.country, currency = excluded.currency, timezone = excluded.timezone, updated_at = now();
  insert into public.subscriptions (organization_id, plan_code, status, trial_started_at, trial_ends_at, current_period_start, current_period_end, payment_provider, cancel_at_period_end)
  values (new_organization_id, selected_plan_code, 'trialing', trial_started, trial_ends, trial_started, trial_ends, 'none', false)
  on conflict (organization_id) do update
    set plan_code = excluded.plan_code, updated_at = now();
  return new_organization_id;
end;
$$;

revoke all on function public.create_organization_onboarding(text, text, text, text, text, text, timestamptz, timestamptz) from public;
grant execute on function public.create_organization_onboarding(text, text, text, text, text, text, timestamptz, timestamptz) to authenticated;

-- This migration is intentionally not applied by Release 1.1 implementation.