alter table public.organization_settings
  add column if not exists country text not null default '',
  add column if not exists currency text not null default 'EUR',
  add column if not exists timezone text not null default 'UTC';

do $$
declare
  has_country_code boolean;
  has_default_currency boolean;
  has_timezone boolean;
  sql text;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'organizations'
      and column_name = 'country_code'
  ) into has_country_code;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'organizations'
      and column_name = 'default_currency'
  ) into has_default_currency;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'organizations'
      and column_name = 'timezone'
  ) into has_timezone;

  sql := 'update public.organization_settings settings set ';

  if has_country_code then
    sql := sql || 'country = case when coalesce(settings.country, '''') <> '''' then settings.country else coalesce(organization.country_code, '''') end, ';
  else
    sql := sql || 'country = settings.country, ';
  end if;

  if has_default_currency then
    sql := sql || 'currency = case when coalesce(settings.currency, '''') <> '''' then settings.currency else coalesce(nullif(organization.default_currency, ''''), ''EUR'') end, ';
  else
    sql := sql || 'currency = settings.currency, ';
  end if;

  if has_timezone then
    sql := sql || 'timezone = case when coalesce(settings.timezone, '''') <> '''' then settings.timezone else coalesce(nullif(organization.timezone, ''''), ''UTC'') end, ';
  else
    sql := sql || 'timezone = settings.timezone, ';
  end if;

  sql := sql || 'updated_at = now() from public.organizations organization where organization.id = settings.organization_id';

  execute sql;
end;
$$;