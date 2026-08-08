create sequence if not exists public.apartment_internal_number_seq;

alter table if exists public.apartments
  add column if not exists internal_number bigint;

with numbered as (
  select id, row_number() over (order by created_at nulls first, id) as number
  from public.apartments
  where internal_number is null
)
update public.apartments as apartments
set internal_number = numbered.number
from numbered
where apartments.id = numbered.id;

select setval(
  'public.apartment_internal_number_seq',
  coalesce((select max(internal_number) from public.apartments), 1),
  (select max(internal_number) is not null from public.apartments)
);

alter table if exists public.apartments
  alter column internal_number set default nextval('public.apartment_internal_number_seq');

create unique index if not exists apartments_internal_number_key
  on public.apartments (internal_number);