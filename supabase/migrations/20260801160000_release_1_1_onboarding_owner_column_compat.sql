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
  owner_column text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'organizations'
      and column_name = 'owner_id'
  ) then
    owner_column := 'owner_id';
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'organizations'
      and column_name = 'created_by'
  ) then
    owner_column := 'created_by';
  else
    raise exception 'organizations owner column is missing';
  end if;

  execute format(
    'select organization.id
     from public.organizations organization
     where organization.slug = $1
       and organization.%I = auth.uid()
     for update',
    owner_column
  ) into new_organization_id using organization_slug;

  if new_organization_id is null then
    execute format(
      'insert into public.organizations (name, slug, %I)
       values ($1, $2, auth.uid())
       on conflict (slug) do nothing
       returning id',
      owner_column
    ) into new_organization_id using organization_name, organization_slug;

    if new_organization_id is null then
      execute format(
        'select organization.id
         from public.organizations organization
         where organization.slug = $1
           and organization.%I = auth.uid()
         for update',
        owner_column
      ) into new_organization_id using organization_slug;
    end if;
  end if;

  if new_organization_id is null then
    raise exception 'Organization slug is already owned by another user';
  end if;

  insert into public.organization_members (organization_id, user_id, role_code, role, status)
  values (new_organization_id, auth.uid(), 'owner', 'owner', 'active')
  on conflict (organization_id, user_id) do update
    set role_code = 'owner', role = 'owner', status = 'active';

  insert into public.organization_settings (organization_id, country, currency, timezone)
  values (
    new_organization_id,
    coalesce(selected_country, ''),
    coalesce(selected_currency, 'EUR'),
    coalesce(selected_timezone, 'UTC')
  )
  on conflict (organization_id) do update
    set country = excluded.country,
        currency = excluded.currency,
        timezone = excluded.timezone,
        updated_at = now();

  insert into public.subscriptions (
    organization_id,
    plan_code,
    status,
    trial_started_at,
    trial_ends_at,
    current_period_start,
    current_period_end,
    payment_provider,
    cancel_at_period_end
  )
  values (
    new_organization_id,
    selected_plan_code,
    'trialing',
    trial_started,
    trial_ends,
    trial_started,
    trial_ends,
    'none',
    false
  )
  on conflict (organization_id) do update
    set plan_code = excluded.plan_code,
        updated_at = now();

  return new_organization_id;
end;
$$;

revoke all on function public.create_organization_onboarding(text, text, text, text, text, text, timestamptz, timestamptz) from public;
grant execute on function public.create_organization_onboarding(text, text, text, text, text, text, timestamptz, timestamptz) to authenticated;