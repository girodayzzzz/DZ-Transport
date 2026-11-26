begin;

create table dz_private.quick_deal_settings (
 singleton boolean primary key default true check (singleton),
 enabled boolean not null default false,
 reservation_minutes integer not null default 60 check (reservation_minutes between 5 and 1440)
);
insert into dz_private.quick_deal_settings default values;

create table dz_private.quick_deals (
 id uuid primary key default gen_random_uuid(),
 inquiry_id uuid not null unique references public.transport_inquiries on delete cascade,
 cargo_category text not null check (length(btrim(cargo_category)) between 1 and 120),
 pickup_region text not null check (length(btrim(pickup_region)) between 1 and 120),
 delivery_region text not null check (length(btrim(delivery_region)) between 1 and 120),
 pickup_window daterange not null,
 delivery_window daterange not null,
 vehicle_requirements text not null check (length(btrim(vehicle_requirements)) between 1 and 500),
 weight_kg numeric(10,2) not null check (weight_kg between 0.01 and 1000000),
 dimensions text not null check (length(btrim(dimensions)) between 1 and 500),
 carrier_minor integer not null check (carrier_minor between 1 and 1000000000),
 currency text not null check (currency in ('EUR','CHF','GBP')),
 vat_treatment text not null check (length(btrim(vat_treatment)) between 1 and 250),
 conditions text not null default '' check (length(conditions)<=1500),
 eligibility_requirements text not null check (length(btrim(eligibility_requirements)) between 1 and 1500),
 expires_at timestamptz not null,
 published_at timestamptz,
 cancelled_at timestamptz,
 reserved_partner uuid references auth.users on delete set null,
 reserved_until timestamptz,
 assigned_at timestamptz,
 check (not isempty(pickup_window) and not lower_inf(pickup_window) and not upper_inf(pickup_window)),
 check (not isempty(delivery_window) and not lower_inf(delivery_window) and not upper_inf(delivery_window)),
 check (lower(delivery_window)>=lower(pickup_window))
);

-- Each row records a manager's explicit eligibility check and the carrier's request.
create table dz_private.quick_deal_candidates (
 id uuid primary key default gen_random_uuid(),
 deal_id uuid not null references dz_private.quick_deals on delete cascade,
 partner_id uuid not null references auth.users on delete cascade,
 eligible_until timestamptz not null,
 requested_at timestamptz,
 unique (deal_id,partner_id)
);
create index on dz_private.quick_deal_candidates(partner_id,deal_id);

alter table dz_private.quick_deal_settings enable row level security;
alter table dz_private.quick_deals enable row level security;
alter table dz_private.quick_deal_candidates enable row level security;
revoke all on dz_private.quick_deal_settings, dz_private.quick_deals, dz_private.quick_deal_candidates
 from public,anon,authenticated;
create trigger quick_deal_audit after insert or update or delete on dz_private.quick_deals
 for each row execute function dz_private.audit();
create trigger quick_deal_candidate_audit after insert or update or delete on dz_private.quick_deal_candidates
 for each row execute function dz_private.audit();

-- All actions for an existing deal take the inquiry lock first, like legacy assignment.
create function dz_private.lock_quick_deal(p_deal uuid)
returns dz_private.quick_deals language plpgsql security definer set search_path='' as $$
declare deal dz_private.quick_deals;
begin
 perform 1 from public.transport_inquiries i join dz_private.quick_deals d on d.inquiry_id=i.id
 where d.id=p_deal and i.status in ('awaiting_carrier_offer','offer_prepared','offer_sent','customer_accepted') for update of i;
 if not found then raise exception 'Unavailable'; end if;
 select * into deal from dz_private.quick_deals where id=p_deal;
 return deal;
end $$;

create function dz_private.require_active_quick_deal(p_deal dz_private.quick_deals)
returns void language plpgsql stable security definer set search_path='' as $$
begin
 if p_deal.published_at is null or p_deal.cancelled_at is not null or p_deal.assigned_at is not null
 or p_deal.expires_at<=clock_timestamp()
 or not exists(select 1 from dz_private.quick_deal_settings where enabled) then
  raise exception 'Unavailable';
 end if;
end $$;

create function public.draft_quick_deal(p_inquiry uuid,p_category text,p_pickup_region text,p_delivery_region text,
 p_pickup daterange,p_delivery daterange,p_vehicle text,p_weight_kg numeric,p_dimensions text,
 p_carrier_minor integer,p_currency text,p_vat text,p_conditions text,p_requirements text,p_expires_at timestamptz)
returns uuid language plpgsql security definer set search_path='' as $$
declare deal_id uuid;
begin
 if not dz_private.has_role('admin') then raise exception 'Unavailable'; end if;
 perform 1 from public.transport_inquiries where id=p_inquiry and status='awaiting_carrier_offer' for update;
 if not found then raise exception 'Unavailable'; end if;
 insert into dz_private.quick_deals(inquiry_id,cargo_category,pickup_region,delivery_region,pickup_window,
  delivery_window,vehicle_requirements,weight_kg,dimensions,carrier_minor,currency,vat_treatment,
  conditions,eligibility_requirements,expires_at)
 values(p_inquiry,p_category,p_pickup_region,p_delivery_region,p_pickup,p_delivery,p_vehicle,p_weight_kg,
  p_dimensions,p_carrier_minor,p_currency,p_vat,p_conditions,p_requirements,p_expires_at) returning id into deal_id;
 return deal_id;
end $$;

create function public.publish_quick_deal(p_deal uuid)
returns void language plpgsql security definer set search_path='' as $$
declare deal dz_private.quick_deals;
begin
 if not dz_private.has_role('admin') then raise exception 'Unavailable'; end if;
 deal:=dz_private.lock_quick_deal(p_deal);
 if deal.published_at is not null or deal.cancelled_at is not null or deal.expires_at<=clock_timestamp()
 or not exists(select 1 from dz_private.quick_deal_settings where enabled)
 or exists(select 1 from public.transport_opportunities where inquiry_id=deal.inquiry_id)
 then raise exception 'Unavailable'; end if;
 update dz_private.quick_deals set published_at=clock_timestamp() where id=p_deal;
end $$;

create function public.attest_quick_deal_eligibility(p_deal uuid,p_partner uuid,p_eligible_until timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare deal dz_private.quick_deals;
begin
 if not dz_private.has_role('admin') or p_eligible_until is null then raise exception 'Unavailable'; end if;
 deal:=dz_private.lock_quick_deal(p_deal);
 if deal.cancelled_at is not null or deal.expires_at<=clock_timestamp() then raise exception 'Unavailable'; end if;
 if not exists(select 1 from public.user_roles r join public.transport_inquiries i on i.id=deal.inquiry_id
  where r.user_id=p_partner and r.role='partner' and r.approved and i.customer_id is distinct from p_partner)
 then raise exception 'Unavailable'; end if;
 insert into dz_private.quick_deal_candidates(deal_id,partner_id,eligible_until)
 values(p_deal,p_partner,p_eligible_until) on conflict(deal_id,partner_id)
 do update set eligible_until=excluded.eligible_until;
end $$;

create function public.list_quick_deals()
returns table(id uuid, reference uuid, cargo_category text, pickup_region text, delivery_region text,
 pickup_window daterange, delivery_window daterange, vehicle_requirements text, weight_kg numeric,
 dimensions text, carrier_minor integer, currency text, vat_treatment text, conditions text,
 eligibility_requirements text, expires_at timestamptz, status text, has_requested boolean,
 reserved_partner uuid, reserved_until timestamptz)
language sql stable security definer set search_path='' as $$
 select d.id,i.reference,d.cargo_category,d.pickup_region,d.delivery_region,d.pickup_window,d.delivery_window,
 d.vehicle_requirements,d.weight_kg,d.dimensions,d.carrier_minor,d.currency,d.vat_treatment,d.conditions,
 d.eligibility_requirements,d.expires_at,
 case
  when d.cancelled_at is not null or i.status='cancelled' then 'cancelled'
  when d.assigned_at is not null and i.status='completed' then 'completed'
  when d.assigned_at is not null then 'assigned'
  when d.expires_at<=statement_timestamp() then 'expired'
  when d.published_at is null then 'draft'
  when d.reserved_until>statement_timestamp() and exists(
   select 1 from dz_private.quick_deal_candidates e join public.user_roles r on r.user_id=e.partner_id
   where e.deal_id=d.id and e.partner_id=d.reserved_partner and e.eligible_until>statement_timestamp()
    and r.role='partner' and r.approved
  ) then 'reserved'
  when c.requested_at is not null or (dz_private.has_role('admin') and exists(
   select 1 from dz_private.quick_deal_candidates e where e.deal_id=d.id and e.requested_at is not null
    and e.eligible_until>statement_timestamp()
  )) then 'acceptance_requested'
  else 'available'
 end,
 c.requested_at is not null,
 case when dz_private.has_role('admin') then d.reserved_partner end,
 case when dz_private.has_role('admin') or d.reserved_partner=auth.uid() then d.reserved_until end
 from dz_private.quick_deals d join public.transport_inquiries i on i.id=d.inquiry_id
 left join dz_private.quick_deal_candidates c on c.deal_id=d.id and c.partner_id=auth.uid()
 where dz_private.has_role('admin') or (
  dz_private.has_role('partner') and c.eligible_until>statement_timestamp() and d.published_at is not null
  and d.cancelled_at is null and d.expires_at>statement_timestamp()
  and d.assigned_at is null and i.status in ('awaiting_carrier_offer','offer_prepared','offer_sent','customer_accepted')
  and exists(select 1 from dz_private.quick_deal_settings where enabled)
 )
 order by case when dz_private.has_role('admin') then i.created_at end desc,
  d.expires_at,d.id limit 100;
$$;

create function public.quick_deal_requests(p_deal uuid)
returns table(partner_id uuid, company_name text, eligible_until timestamptz, requested_at timestamptz)
language sql stable security definer set search_path='' as $$
 select c.partner_id,b.name,c.eligible_until,c.requested_at
 from dz_private.quick_deal_candidates c join public.companies b on b.owner_id=c.partner_id
 where c.deal_id=p_deal and c.requested_at is not null and dz_private.has_role('admin')
 order by c.requested_at,c.partner_id;
$$;

alter table public.notifications drop constraint notifications_event_check,
 add constraint notifications_event_check check (event in (
  'inquiry_received','partner_applied','offer_prepared','offer_accepted','status_changed','quick_deal_requested','quick_deal_reserved'
 ));

alter policy own_notifications on public.notifications using (
 recipient_id=(select auth.uid()) and (select dz_private.confirmed())
 and (event='status_changed' or (event='quick_deal_reserved' and (select dz_private.has_role('partner')))
  or (select dz_private.has_role('admin'))));
create or replace function public.mark_notification_read(p_notification uuid)
returns void language sql security definer set search_path='' as $$
 update public.notifications set read_at=now()
 where id=p_notification and recipient_id=auth.uid() and read_at is null and dz_private.confirmed()
 and (event='status_changed' or (event='quick_deal_reserved' and dz_private.has_role('partner'))
  or dz_private.has_role('admin'));
$$;

create function public.request_quick_deal(p_deal uuid)
returns void language plpgsql security definer set search_path='' as $$
declare deal dz_private.quick_deals;
begin
 if not dz_private.has_role('partner') then raise exception 'Unavailable'; end if;
 deal:=dz_private.lock_quick_deal(p_deal);
 perform dz_private.require_active_quick_deal(deal);
 perform 1 from public.user_roles where user_id=auth.uid() and role='partner' and approved for share;
 if not found then raise exception 'Unavailable'; end if;
 perform 1 from dz_private.quick_deal_candidates
 where deal_id=p_deal and partner_id=auth.uid() and eligible_until>clock_timestamp();
 if not found then raise exception 'Unavailable'; end if;
 update dz_private.quick_deal_candidates set requested_at=clock_timestamp()
 where deal_id=p_deal and partner_id=auth.uid() and requested_at is null;
 if found then
  insert into public.notifications(recipient_id,event)
  select user_id,'quick_deal_requested' from public.user_roles where role='admin' and approved;
 end if;
end $$;

create function public.reserve_quick_deal(p_deal uuid,p_partner uuid)
returns void language plpgsql security definer set search_path='' as $$
declare deal dz_private.quick_deals; eligibility_expiry timestamptz;
begin
 if not dz_private.has_role('admin') then raise exception 'Unavailable'; end if;
 deal:=dz_private.lock_quick_deal(p_deal);
 perform dz_private.require_active_quick_deal(deal);
 select c.eligible_until into eligibility_expiry
 from dz_private.quick_deal_candidates c join public.user_roles r on r.user_id=c.partner_id
 where c.deal_id=p_deal and c.partner_id=p_partner and c.requested_at is not null
 and c.eligible_until>clock_timestamp() and r.role='partner' and r.approved for share of r;
 if not found then raise exception 'Unavailable'; end if;
 if deal.reserved_until>clock_timestamp() and exists(
  select 1 from dz_private.quick_deal_candidates c join public.user_roles r on r.user_id=c.partner_id
  where c.deal_id=p_deal and c.partner_id=deal.reserved_partner and c.eligible_until>clock_timestamp()
   and r.role='partner' and r.approved
 ) then
  if deal.reserved_partner=p_partner then return; end if;
  raise exception 'Already reserved';
 end if;
 update dz_private.quick_deals d set reserved_partner=p_partner,
  reserved_until=least(deal.expires_at,eligibility_expiry,clock_timestamp()+make_interval(mins=>s.reservation_minutes))
 from dz_private.quick_deal_settings s where d.id=p_deal;
 insert into public.notifications(recipient_id,event) values(p_partner,'quick_deal_reserved');
end $$;

create function public.cancel_quick_deal(p_deal uuid)
returns void language plpgsql security definer set search_path='' as $$
declare deal dz_private.quick_deals;
begin
 if not dz_private.has_role('admin') then raise exception 'Unavailable'; end if;
 deal:=dz_private.lock_quick_deal(p_deal);
 update dz_private.quick_deals set cancelled_at=clock_timestamp(),reserved_partner=null,reserved_until=null
 where id=deal.id and cancelled_at is null and assigned_at is null;
end $$;

create function public.assign_quick_deal(p_deal uuid,p_order uuid,p_instructions text,p_contract_confirmed boolean)
returns void language plpgsql security definer set search_path='' as $$
declare deal dz_private.quick_deals;
begin
 if not dz_private.has_role('admin') or p_contract_confirmed is distinct from true then
  raise exception 'Unavailable';
 end if;
 deal:=dz_private.lock_quick_deal(p_deal);
 perform dz_private.require_active_quick_deal(deal);
 if deal.reserved_until is null or deal.reserved_until<=clock_timestamp() or not exists(
  select 1 from dz_private.quick_deal_candidates c where c.deal_id=p_deal
   and c.partner_id=deal.reserved_partner and c.eligible_until>clock_timestamp()
 ) or not exists(select 1 from public.transport_orders where id=p_order and inquiry_id=deal.inquiry_id)
 then raise exception 'Unavailable'; end if;
 perform dz_private.assign_accepted_order(p_order,deal.reserved_partner,p_instructions);
 if deal.reserved_until<=clock_timestamp() then raise exception 'Reservation expired'; end if;
 update public.quote_costs c set carrier_minor=deal.carrier_minor
 from public.transport_orders o join public.transport_quotes q on q.id=o.quote_id
 where o.id=p_order and c.quote_id=q.id and q.currency=deal.currency;
 if not found then raise exception 'Customer quote currency must match the deal'; end if;
 update dz_private.quick_deals set assigned_at=clock_timestamp() where id=p_deal;
end $$;

create or replace function public.assign_transport(p_order uuid,p_partner uuid,p_instructions text)
returns void language plpgsql security definer set search_path='' as $$
declare inquiry uuid;
begin
 if not dz_private.has_role('admin') then raise exception 'Unavailable'; end if;
 select i.id into inquiry from public.transport_orders o join public.transport_inquiries i on i.id=o.inquiry_id
 where o.id=p_order for update of i;
 if exists(select 1 from dz_private.quick_deals where inquiry_id=inquiry and published_at is not null
  and cancelled_at is null and expires_at>clock_timestamp()) then raise exception 'Use Quick Deal assignment'; end if;
 perform dz_private.assign_accepted_order(p_order,p_partner,p_instructions);
end $$;

-- Keep legacy quotation invitations and a published Quick Deal mutually exclusive.
create function dz_private.guard_quick_deal_invitation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.transport_inquiries where id=new.inquiry_id for update;
 if exists(select 1 from dz_private.quick_deals where inquiry_id=new.inquiry_id and published_at is not null
  and cancelled_at is null and expires_at>clock_timestamp()) then raise exception 'Quick Deal is active'; end if;
 return new;
end $$;
create trigger guard_quick_deal_invitation before insert on public.transport_opportunities
 for each row execute function dz_private.guard_quick_deal_invitation();

revoke execute on function dz_private.lock_quick_deal(uuid),dz_private.require_active_quick_deal(dz_private.quick_deals),
 dz_private.guard_quick_deal_invitation() from public,anon,authenticated;

do $$
declare signature regprocedure;
begin
 for signature in
  select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in (
   'draft_quick_deal','publish_quick_deal','attest_quick_deal_eligibility','list_quick_deals','quick_deal_requests',
   'request_quick_deal','reserve_quick_deal','cancel_quick_deal','assign_quick_deal')
 loop
  execute format('revoke execute on function %s from public, anon, authenticated',signature);
  execute format('grant execute on function %s to authenticated',signature);
 end loop;
end $$;

commit;
