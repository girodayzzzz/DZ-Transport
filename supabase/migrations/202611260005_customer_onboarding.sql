begin;

-- An account classification carries no role, verification or billing privileges.
alter table public.profiles
 add column account_type text check (account_type in ('private_customer','business_customer')),
 add column business_name text check (length(btrim(business_name)) between 1 and 160),
 add column onboarding_completed_at timestamptz,
 add constraint customer_onboarding_consistent check (
  (business_name is null or account_type is not distinct from 'business_customer')
  and (onboarding_completed_at is null or (
   account_type is not null
   and (account_type <> 'business_customer' or business_name is not null)
  ))
 );

create function public.choose_customer_account_type(p_type text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not dz_private.confirmed() or p_type is null or p_type not in ('private_customer','business_customer') then
  raise exception 'Unavailable';
 end if;
 insert into public.profiles(id,account_type) values(auth.uid(),p_type)
 on conflict(id) do update set account_type=excluded.account_type,business_name=null
 where profiles.onboarding_completed_at is null and profiles.account_type is distinct from excluded.account_type;
end $$;

create function public.complete_free_customer_onboarding(p_name text,p_business_name text default null)
returns void language plpgsql security definer set search_path='' as $$
declare selected_type text;
begin
 if not dz_private.confirmed() or p_name is null or length(btrim(p_name)) not between 1 and 120 then
  raise exception 'Unavailable';
 end if;
 select account_type into selected_type from public.profiles
 where id=auth.uid() and onboarding_completed_at is null for update;
 if selected_type is null then
  if exists(select 1 from public.profiles where id=auth.uid() and onboarding_completed_at is not null) then return; end if;
  raise exception 'Unavailable';
 end if;
 if selected_type='business_customer' and (p_business_name is null or length(btrim(p_business_name)) not between 1 and 160) then
  raise exception 'Business name required';
 end if;
 update public.profiles set display_name=btrim(p_name),
  business_name=case when selected_type='business_customer' then btrim(p_business_name) end,
  onboarding_completed_at=now() where id=auth.uid();
end $$;

-- Preserve V3's column-scoped profile writes. Only these RPCs can update onboarding.
revoke execute on function public.choose_customer_account_type(text),
 public.complete_free_customer_onboarding(text,text) from public,anon,authenticated;
grant execute on function public.choose_customer_account_type(text),
 public.complete_free_customer_onboarding(text,text) to authenticated;

commit;
