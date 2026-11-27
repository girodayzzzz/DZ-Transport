begin;

create table dz_private.payment_settings (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 checkout_minutes integer not null default 60 check(checkout_minutes between 35 and 1440),
 quick_deal_hours integer not null default 48 check(quick_deal_hours between 1 and 720),
 confirmation_hours integer not null default 72 check(confirmation_hours between 1 and 720),
 commission_vat_bps integer not null default 0 check(commission_vat_bps between 0 and 10000),
 commission_includes_vat boolean not null default true,
 stripe_fee_payer text not null default 'platform' check(stripe_fee_payer in ('platform','carrier')),
 cancellation_fee_bps integer not null default 0 check(cancellation_fee_bps between 0 and 10000)
);
insert into dz_private.payment_settings default values;

create table public.transport_payments (
 id uuid primary key default gen_random_uuid(),
 inquiry_id uuid not null references public.transport_inquiries on delete restrict,
 quote_id uuid references public.transport_quotes on delete restrict,
 deal_id uuid references dz_private.quick_deals on delete restrict,
 customer_id uuid references auth.users on delete set null,
 partner_id uuid references auth.users on delete set null,
 kind text not null check(kind in ('quote','quick_deal')),
 state text not null default 'checkout_pending' check(state in
  ('checkout_pending','payment_failed','expired','paid','refund_pending','partially_refunded','refunded')),
 gross_minor integer not null check(gross_minor between 50 and 99999999),
 currency text not null default 'EUR' check(currency='EUR'),
 plan text,
 rate integer,
 commission_minor integer,
 vat_minor integer,
 processor_fee_minor integer not null default 0 check(processor_fee_minor>=0),
 refunded_minor integer not null default 0 check(refunded_minor>=0 and refunded_minor<=gross_minor),
 terms jsonb not null,
 expires_at timestamptz not null,
 delivered_at timestamptz,
 confirmed_at timestamptz,
 review_reason text,
 delivery_dispute boolean not null default false,
 card_dispute boolean not null default false,
 settled_at timestamptz,
 created_at timestamptz not null default now()
);
create unique index transport_payment_reservation on public.transport_payments(inquiry_id) where state<>'expired';
create index transport_payment_expiration on public.transport_payments(expires_at,state);
alter table public.transport_payments enable row level security;
revoke all on public.transport_payments from public,anon,authenticated;
grant select on public.transport_payments to authenticated;
create policy transport_payment_participants on public.transport_payments for select to authenticated
 using (customer_id=auth.uid() or (partner_id=auth.uid() and dz_private.has_role('partner')) or dz_private.has_role('admin'));

create table dz_private.payment_stripe (
 payment_id uuid primary key references public.transport_payments on delete restrict,
 session_id text unique, intent_id text unique, charge_id text unique,
 transfer_id text unique, transfer_minor integer, receipt_url text
);
create table dz_private.carrier_connect (
 partner_id uuid primary key references auth.users on delete restrict,
 account_id text unique,
 schedule text not null default 'weekly' check(schedule in ('weekly','monthly','manual')),
 manual_since timestamptz
);
create table dz_private.payment_operations (
 id uuid primary key default gen_random_uuid(),
 payment_id uuid references public.transport_payments on delete restrict,
 partner_id uuid references auth.users on delete restrict,
 kind text not null check(kind in ('checkout','expire','refund','transfer','reversal','account','payout','schedule')),
 operation_key text not null unique,
 payload jsonb not null default '{}',
 result jsonb,
 status text not null default 'queued' check(status in ('queued','running','done','review')),
 error text,
 attempted_at timestamptz,
 first_attempt_at timestamptz,
 created_at timestamptz not null default now()
);
create table dz_private.stripe_events (
 event_id text primary key,
 created_at timestamptz not null default now()
);
create table public.payment_activity (
 id bigint generated always as identity primary key,
 payment_id uuid not null references public.transport_payments on delete restrict,
 event text not null, actor uuid, reason text,
 created_at timestamptz not null default now()
);
alter table public.payment_activity enable row level security;
revoke all on public.payment_activity from public,anon,authenticated;
grant select (id,payment_id,event,created_at) on public.payment_activity to authenticated;
create policy payment_activity_participants on public.payment_activity for select to authenticated
 using(exists(select 1 from public.transport_payments p where p.id=payment_id));
alter table dz_private.payment_settings enable row level security;
alter table dz_private.payment_stripe enable row level security;
alter table dz_private.carrier_connect enable row level security;
alter table dz_private.payment_operations enable row level security;
alter table dz_private.stripe_events enable row level security;
revoke all on dz_private.payment_settings,dz_private.payment_stripe,dz_private.carrier_connect,dz_private.payment_operations,dz_private.stripe_events from public,anon,authenticated;

create function dz_private.payment_log(p_id uuid,p_event text,p_reason text default null) returns void
language sql set search_path='' as $$
 insert into public.payment_activity(payment_id,event,actor,reason) values(p_id,p_event,auth.uid(),p_reason);
$$;

create function dz_private.payment_enqueue(p_payment uuid,p_partner uuid,p_kind text,p_key text,p_payload jsonb default '{}') returns void
language sql set search_path='' as $$
 insert into dz_private.payment_operations(payment_id,partner_id,kind,operation_key,payload)
 values(p_payment,p_partner,p_kind,p_key,p_payload) on conflict(operation_key) do nothing;
$$;

create function dz_private.payment_commission(p_amount integer,p_rate integer,p_terms jsonb) returns integer
language sql immutable set search_path='' as $$
 select case when (p_terms->>'vat_included')::boolean then fee
 else fee+(fee*(p_terms->>'vat_bps')::bigint+5000)/10000 end::integer
 from (select (p_amount::bigint*p_rate+50)/100 as fee) base;
$$;

create function dz_private.payment_vat(p_fee integer,p_terms jsonb) returns integer
language sql immutable set search_path='' as $$
 select ((p_fee::bigint*rate + (10000+rate)/2)/(10000+rate))::integer
 from (select (p_terms->>'vat_bps')::integer as rate) vat;
$$;

create function dz_private.payment_expense(p_gross integer,p_refunded integer,p_fee integer,p_processor_fee integer,p_terms jsonb)
returns integer language sql immutable set search_path='' as $$
 select case when p_terms->>'stripe_fee_payer'='carrier'
 then least(greatest(0,p_gross-p_refunded-coalesce(p_fee,0)),
  ((p_gross-p_refunded)::bigint*p_processor_fee+p_gross/2)/p_gross)::integer else 0 end;
$$;

create function public.v8_begin_checkout(p_kind text,p_target uuid,p_request uuid,p_input jsonb default '{}') returns uuid
language plpgsql security definer set search_path='' as $$
declare cfg dz_private.payment_settings; i public.transport_inquiries; q public.transport_quotes;
 d dz_private.quick_deals; p public.transport_payments; carrier uuid; plan_code text; fee_rate integer;
 gross integer; deal uuid; offer uuid; terms jsonb; fee integer;
begin
 select * into cfg from dz_private.payment_settings where enabled;
 if not found or not dz_private.confirmed() or p_request is null then raise exception 'Unavailable'; end if;
 terms:=jsonb_build_object('vat_included',cfg.commission_includes_vat,'vat_bps',cfg.commission_vat_bps,
  'stripe_fee_payer',cfg.stripe_fee_payer,'cancellation_fee_bps',cfg.cancellation_fee_bps,'test_assumption',true);
 if p_kind='quote' then
  select * into q from public.transport_quotes where id=p_target and opportunity_id is not null;
  select * into i from public.transport_inquiries where id=q.inquiry_id and customer_id=auth.uid() for update;
  if not found then raise exception 'Unavailable'; end if;
  select * into p from public.transport_payments where inquiry_id=i.id and state<>'expired' and not superseded;
  if found then
   if p.quote_id=q.id and p.state in ('checkout_pending','payment_failed') and p.expires_at>clock_timestamp() then return p.id; end if;
   raise exception 'Payment already reserved';
  end if;
  if exists(select 1 from public.transport_payments where id=p_request and inquiry_id=i.id
   and (state='expired' or superseded)) then p_request:=gen_random_uuid(); end if;
  select * into q from public.transport_quotes where id=p_target and status='sent' and valid_until>=current_date for share;
  if not found or q.currency<>'EUR' or i.status not in ('awaiting_carrier_offer','offer_prepared','offer_sent')
   or exists(select 1 from dz_private.quick_deals where inquiry_id=i.id and cancelled_at is null) then raise exception 'Unavailable'; end if;
  select o.partner_id into carrier from public.transport_opportunities o join public.user_roles r
    on r.user_id=o.partner_id and r.role='partner' and r.approved
    where o.id=q.opportunity_id and o.open and o.inquiry_id=i.id and o.partner_id<>auth.uid() for share of r,o;
  if not found then raise exception 'Unavailable'; end if;
  plan_code:=dz_private.carrier_plan(carrier);
  fee_rate:=dz_private.fee_rate(plan_code);
  gross:=q.amount_minor;
  offer:=q.id;
 elsif p_kind='quick_deal' then
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
  select * into p from public.transport_payments where id=p_request and customer_id=auth.uid() and kind=p_kind;
  if found then
   if p.state in ('checkout_pending','payment_failed') and p.expires_at>clock_timestamp() then return p.id; end if;
   raise exception 'Payment closed';
  end if;
  if not exists(select 1 from dz_private.quick_deal_settings where enabled) then raise exception 'Unavailable'; end if;
  if (select count(*) from public.transport_inquiries where customer_id=auth.uid()
   and created_at>clock_timestamp()-interval '1 hour')>=10 then raise exception 'Rate limit'; end if;
  gross:=(p_input->>'amount')::integer;
  if lower((p_input->>'pickup')::daterange)<current_date then raise exception 'Pickup date is in the past'; end if;
  insert into public.transport_inquiries(customer_id,contact_email,origin,destination,description,status)
  select auth.uid(),email,p_input->>'origin',p_input->>'destination',p_input->>'description','awaiting_carrier_offer'
  from auth.users where id=auth.uid()
  returning * into i;
  insert into dz_private.quick_deals(inquiry_id,cargo_category,pickup_region,delivery_region,pickup_window,
   delivery_window,vehicle_requirements,weight_kg,dimensions,carrier_minor,currency,vat_treatment,eligibility_requirements,expires_at)
  values(i.id,p_input->>'category',i.origin,i.destination,(p_input->>'pickup')::daterange,
   (p_input->>'delivery')::daterange,p_input->>'vehicle',(p_input->>'weight')::numeric,
   p_input->>'dimensions',gross,'EUR',p_input->>'vat',p_input->>'requirements',
   clock_timestamp()+make_interval(mins=>cfg.checkout_minutes,hours=>cfg.quick_deal_hours))
  returning id into deal;
 else raise exception 'Unavailable';
 end if;
 fee:=dz_private.payment_commission(gross,fee_rate,terms);
 insert into public.transport_payments(id,inquiry_id,quote_id,deal_id,customer_id,partner_id,kind,gross_minor,plan,rate,
  commission_minor,vat_minor,terms,expires_at)
 values(p_request,i.id,offer,deal,auth.uid(),carrier,p_kind,gross,plan_code,fee_rate,fee,
  dz_private.payment_vat(fee,terms),terms,clock_timestamp()+make_interval(mins=>cfg.checkout_minutes))
 returning * into p;
 insert into dz_private.payment_stripe(payment_id) values(p.id);
 perform dz_private.payment_enqueue(p.id,null,'checkout','checkout:'||p.id,jsonb_build_object('language',p_input->>'language'));
 perform dz_private.payment_log(p.id,'checkout_pending');
 return p.id;
end $$;

create function dz_private.v8_accept_paid(p public.transport_payments,p_carrier uuid) returns void
language plpgsql set search_path='' as $$
declare q public.transport_quotes; d dz_private.quick_deals; offer uuid; transport_order uuid;
begin
 if not exists(select 1 from public.user_roles where user_id=p_carrier and role='partner' and approved)
  or p_carrier=p.customer_id then raise exception 'Unavailable'; end if;
 if p.kind='quote' then
  select * into strict q from public.transport_quotes where id=p.quote_id;
 else
  select * into strict d from dz_private.quick_deals where id=p.deal_id;
 end if;
 update public.transport_quotes set status='withdrawn'
 where inquiry_id=p.inquiry_id and opportunity_id is null and status in ('sent','draft');
 insert into public.transport_quotes(inquiry_id,amount_minor,currency,vat_treatment,valid_until,status)
 values(p.inquiry_id,p.gross_minor,p.currency,coalesce(q.vat_treatment,d.vat_treatment),current_date,'accepted') returning id into offer;
 insert into public.quote_costs(quote_id,carrier_minor,expenses_minor)
 values(offer,p.gross_minor,0);
 insert into public.transport_orders(inquiry_id,quote_id) values(p.inquiry_id,offer) returning id into transport_order;
 update public.transport_inquiries set status='customer_accepted' where id=p.inquiry_id;
 insert into public.transport_assignments(order_id,partner_id,instructions)
 select transport_order,p_carrier,description from public.transport_inquiries where id=p.inquiry_id;
 update public.transport_opportunities set open=false where inquiry_id=p.inquiry_id and open;
 update public.transport_inquiries set status='carrier_assigned' where id=p.inquiry_id;
 update public.transport_inquiries set status='scheduled' where id=p.inquiry_id;
end $$;

alter function dz_private.open_transport_records(uuid,uuid,uuid,boolean) rename to open_legacy_transport_records;

create function dz_private.open_transport_records(p_order uuid,p_assignment uuid,p_partner uuid,p_replacement boolean)
returns void language plpgsql set search_path='' as $$
declare p public.transport_payments; ref uuid;
begin
 select t.* into p from public.transport_payments t join public.transport_orders o on o.inquiry_id=t.inquiry_id
 where o.id=p_order and t.state<>'expired' and not t.superseded;
 if not found then
  perform dz_private.open_legacy_transport_records(p_order,p_assignment,p_partner,p_replacement);
  return;
 end if;
 if p.state<>'paid' or p.partner_id is distinct from p_partner or p_replacement then raise exception 'Unavailable'; end if;
 select reference into strict ref from public.transport_inquiries where id=p.inquiry_id;
 insert into public.transport_conversations(order_id,assignment_id,partner_id,reference) values(p_order,p_assignment,p_partner,ref);
end $$;

create function public.v8_accept_quick_deal(p_deal uuid,p_amount integer,p_plan text) returns void
language plpgsql security definer set search_path='' as $$
declare d dz_private.quick_deals; p public.transport_payments; fee_rate integer; fee integer;
begin
 if not dz_private.has_role('partner') then raise exception 'Unavailable'; end if;
 d:=dz_private.lock_quick_deal(p_deal);
 perform dz_private.require_active_quick_deal(d);
 perform 1 from public.user_roles where role='partner' and user_id=auth.uid() and approved for share;
 if not found or p_plan is distinct from dz_private.carrier_plan(auth.uid()) then raise exception 'Carrier terms changed'; end if;
 perform 1 from dz_private.quick_deal_candidates where deal_id=d.id and partner_id=auth.uid()
  and eligible_until>clock_timestamp() for share;
 if not found then raise exception 'Unavailable'; end if;
 select * into p from public.transport_payments where deal_id=d.id and state='paid' and partner_id is null for update;
 if not found or p.gross_minor<>p_amount or p.customer_id=auth.uid() or p.card_dispute then raise exception 'Unavailable'; end if;
 fee_rate:=dz_private.fee_rate(p_plan);
 fee:=dz_private.payment_commission(p.gross_minor,fee_rate,p.terms);
 update public.transport_payments set partner_id=auth.uid(),plan=p_plan,rate=fee_rate,commission_minor=fee,
  vat_minor=dz_private.payment_vat(fee,p.terms) where id=p.id returning * into p;
 perform dz_private.v8_accept_paid(p,auth.uid());
 update dz_private.quick_deals set assigned_at=clock_timestamp() where id=d.id;
 perform dz_private.payment_log(p.id,'carrier_assigned');
end $$;

alter table public.transport_payments add column superseded boolean not null default false;
drop index public.transport_payment_reservation;
create unique index transport_payment_reservation on public.transport_payments(inquiry_id) where state<>'expired' and not superseded;
create unique index transport_payment_deal on public.transport_payments(deal_id);

create function dz_private.v8_status_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare p public.transport_payments;
begin
 select * into p from public.transport_payments where inquiry_id=new.id and state<>'expired' and not superseded for update;
 if not found then return new; end if;
 if new.status in ('customer_accepted','carrier_assigned','scheduled','picked_up','in_transit','delivered')
  and (p.state not in ('paid','partially_refunded') or p.partner_id is null) then raise exception 'Payment required'; end if;
 if new.status in ('picked_up','in_transit','delivered') and auth.uid() is distinct from p.partner_id then
  raise exception 'Assigned carrier required';
 end if;
 if new.status='delivered' then
  update public.transport_payments set delivered_at=clock_timestamp() where id=p.id;
  perform dz_private.payment_log(p.id,'delivered');
 end if;
 if new.status in ('picked_up','in_transit') then perform dz_private.payment_log(p.id,new.status::text); end if;
 if new.status='completed' and p.confirmed_at is null then raise exception 'Delivery confirmation required'; end if;
 if new.status='cancelled' and p.state not in ('refund_pending','refunded') then raise exception 'Use payment cancellation'; end if;
 return new;
end $$;
create trigger v8_status_guard before update of status on public.transport_inquiries
 for each row when(old.status is distinct from new.status) execute function dz_private.v8_status_guard();

create function dz_private.v8_publish_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.published_at is distinct from old.published_at and new.published_at is not null and exists(select 1 from public.transport_payments
  where deal_id=new.id and state<>'paid') then raise exception 'Payment required'; end if;
 if new.cancelled_at is distinct from old.cancelled_at and exists(select 1 from public.transport_payments
  where deal_id=new.id and state not in ('expired','refund_pending','refunded')) then raise exception 'Use payment cancellation'; end if;
 return new;
end $$;
create trigger v8_publish_guard before update of published_at,cancelled_at on dz_private.quick_deals
 for each row execute function dz_private.v8_publish_guard();

create function dz_private.v8_opportunity_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.transport_payments where inquiry_id=new.inquiry_id
  and kind='quick_deal' and state not in ('expired','refunded')) then raise exception 'Quick Deal already posted'; end if;
 return new;
end $$;
create trigger v8_opportunity_guard before insert on public.transport_opportunities
 for each row execute function dz_private.v8_opportunity_guard();

create function dz_private.load_publication_allowed(p_inquiry uuid) returns boolean
language sql stable set search_path='' as $$
 select not exists(select 1 from dz_private.quick_deals d where d.inquiry_id=p_inquiry and d.cancelled_at is null
  and not exists(select 1 from public.transport_payments p where p.deal_id=d.id
   and p.state='paid' and p.partner_id is null and p.expires_at>statement_timestamp()));
$$;

create or replace function dz_private.is_public_load(p_inquiry uuid) returns boolean
language sql stable set search_path='' as $$
 select exists(
  select 1 from dz_private.published_loads l join public.transport_inquiries i on i.id=l.inquiry_id
  where l.inquiry_id=p_inquiry and l.published and i.archived_at is null and i.status='awaiting_carrier_offer'
   and dz_private.load_publication_allowed(i.id)
 );
$$;

create or replace function public.publish_load(p_inquiry uuid,p_category text,p_origin text,p_destination text,p_test boolean,p_published boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare publication uuid;
begin
 if not dz_private.has_role('admin') then raise exception 'Unavailable'; end if;
 perform 1 from public.transport_inquiries where id=p_inquiry for update;
 if not found or (p_published and not exists(
  select 1 from public.transport_inquiries i where i.id=p_inquiry and i.status='awaiting_carrier_offer'
   and i.archived_at is null and dz_private.load_publication_allowed(i.id)
 )) then raise exception 'Unavailable'; end if;
 insert into dz_private.published_loads(inquiry_id,category,origin_country,destination_country,test_data,published)
 values(p_inquiry,p_category,p_origin,p_destination,p_test,p_published)
 on conflict(inquiry_id) do update set category=excluded.category,origin_country=excluded.origin_country,
 destination_country=excluded.destination_country,test_data=excluded.test_data,published=excluded.published
 returning public_id into publication;
 return publication;
end $$;

create function dz_private.v8_load_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.published and exists(select 1 from public.transport_payments p where p.inquiry_id=new.inquiry_id
  and p.kind='quick_deal' and p.state in ('checkout_pending','payment_failed','expired','refund_pending','refunded'))
 then raise exception 'Quick Deal is unavailable'; end if;
 return new;
end $$;
create trigger v8_load_guard before insert or update of published on dz_private.published_loads
 for each row execute function dz_private.v8_load_guard();

create function public.v8_available() returns boolean
language sql stable security definer set search_path='' as $$
 select enabled from dz_private.payment_settings;
$$;

alter function public.accept_customer_offer(uuid) rename to v8_legacy_accept_customer_offer;
revoke all on function public.v8_legacy_accept_customer_offer(uuid) from public,anon,authenticated;
create function public.accept_customer_offer(p_quote uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if public.v8_available() then raise exception 'Select a payable carrier bid'; end if;
 perform public.v8_legacy_accept_customer_offer(p_quote);
end $$;
revoke all on function public.accept_customer_offer(uuid) from public,anon,authenticated;
grant execute on function public.accept_customer_offer(uuid) to authenticated;

create function public.v8_customer_bids() returns table
 (id uuid,inquiry_id uuid,amount_minor integer,currency text,vat_treatment text,valid_until date,status text)
language sql stable security definer set search_path='' as $$
 select q.id,i.reference,q.amount_minor,q.currency,q.vat_treatment,q.valid_until,q.status
 from public.transport_quotes q join public.transport_opportunities o on o.id=q.opportunity_id
 join public.transport_inquiries i on i.id=q.inquiry_id
 where i.customer_id=auth.uid() and q.status='sent' and q.valid_until>=current_date and q.currency='EUR' and o.open
 and i.status in ('awaiting_carrier_offer','offer_prepared','offer_sent') and dz_private.confirmed() and public.v8_available()
 order by q.created_at desc limit 100;
$$;

create function public.v8_payment_action(p_payment uuid,p_action text,p_reason text default null,p_amount integer default null)
returns void language plpgsql security definer set search_path='' as $$
declare p public.transport_payments; owner boolean; manager boolean; maybe_inquiry uuid;
begin
 select inquiry_id into maybe_inquiry from public.transport_payments where id=p_payment;
 perform 1 from public.transport_inquiries where id=maybe_inquiry for update;
 select * into p from public.transport_payments where id=p_payment for update;
 owner:=auth.uid() is not null and p.customer_id=auth.uid();
 manager:=dz_private.has_role('admin');
 if not found then raise exception 'Unavailable'; end if;
 if not coalesce(owner,false) and not manager and not (p.partner_id is not null and p.partner_id=auth.uid()
  and dz_private.has_role('partner') and p_action='dispute') then raise exception 'Unavailable'; end if;
 if (manager or p_action='dispute') and (p_reason is null or length(btrim(p_reason)) not between 3 and 4000) then
  raise exception 'Reason required';
 end if;
 if p_action='confirm' then
  if p.confirmed_at is not null then return; end if;
  if p.delivered_at is null or p.state not in ('paid','partially_refunded') or p.card_dispute
   or (not manager and (p.delivery_dispute or p.review_reason is not null or
    p.delivered_at+make_interval(hours=>(select confirmation_hours from dz_private.payment_settings))<=clock_timestamp()))
   then raise exception 'Unavailable'; end if;
  update public.transport_payments set confirmed_at=clock_timestamp(),review_reason=null,delivery_dispute=false where id=p.id;
  update public.transport_inquiries set status='completed' where id=p.inquiry_id and status='delivered';
  perform dz_private.payment_enqueue(p.id,p.partner_id,'transfer','transfer:'||p.id);
 elsif p_action='dispute' then
  if p.state not in ('paid','partially_refunded') or p.confirmed_at is not null then raise exception 'Unavailable'; end if;
  update public.transport_payments set delivery_dispute=true,review_reason='delivery_dispute' where id=p.id;
 elsif p_action='dismiss' and manager and p.review_reason in ('delivery_dispute','cancellation_requested')
  and p.state in ('paid','partially_refunded') and not p.card_dispute then
  update public.transport_payments set review_reason=null,delivery_dispute=false where id=p.id;
 elsif p_action='cancel' and p.state in ('checkout_pending','payment_failed') then
  perform dz_private.payment_enqueue(p.id,p.partner_id,'expire','expire:'||p.id);
  update public.transport_payments set expires_at=clock_timestamp(),review_reason='cancellation_requested' where id=p.id;
 elsif p_action='cancel' and owner and p.state='paid' and p.confirmed_at is null then
  update public.transport_payments set review_reason='cancellation_requested' where id=p.id;
 elsif p_action='refund' and manager and p.state in ('paid','partially_refunded') and not p.card_dispute then
  if p_amount is null or p_amount<1 or p_amount>p.gross_minor-p.refunded_minor then raise exception 'Invalid refund'; end if;
  if exists(select 1 from dz_private.payment_operations where payment_id=p.id and kind='transfer' and status='running')
  then raise exception 'Transfer reconciliation required'; end if;
  update public.transport_payments set state='refund_pending',review_reason=null where id=p.id;
  perform dz_private.payment_enqueue(p.id,p.partner_id,'refund','refund:'||p.id||':'||p.refunded_minor,
    jsonb_build_object('amount',p_amount));
 else raise exception 'Unavailable';
 end if;
 perform dz_private.payment_log(p.id,p_action,p_reason);
end $$;

create function public.v8_connect_action(p_action text,p_schedule text,p_request uuid,p_amount integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c dz_private.carrier_connect; op_key text;
begin
 if not dz_private.has_role('partner') or not public.v8_available() then raise exception 'Unavailable'; end if;
 insert into dz_private.carrier_connect(partner_id) values(auth.uid()) on conflict do nothing;
 select * into strict c from dz_private.carrier_connect where partner_id=auth.uid() for update;
 if p_action='connect' and c.account_id is null then
  op_key:='account:'||auth.uid();
  perform dz_private.payment_enqueue(null,auth.uid(),'account',op_key);
 elsif p_action='schedule' and c.account_id is not null and p_schedule in ('weekly','monthly','manual') and p_request is not null then
  op_key:='schedule:'||auth.uid()||':'||p_request;
  if exists(select 1 from dz_private.payment_operations where partner_id=auth.uid() and kind in ('schedule','payout')
   and status in ('queued','running','review') and operation_key<>op_key) then raise exception 'Operation pending'; end if;
  perform dz_private.payment_enqueue(null,auth.uid(),'schedule',op_key,jsonb_build_object('schedule',p_schedule));
 elsif p_action='payout' and c.account_id is not null and c.schedule='manual' and p_amount>0 and p_request is not null then
  op_key:='payout:'||auth.uid()||':'||p_request;
  if exists(select 1 from dz_private.payment_operations where partner_id=auth.uid() and kind in ('schedule','payout')
   and status in ('queued','running','review') and operation_key<>op_key) then raise exception 'Operation pending'; end if;
  perform dz_private.payment_enqueue(null,auth.uid(),'payout',op_key,jsonb_build_object('amount',p_amount));
 elsif p_action not in ('connect','status') then raise exception 'Unavailable';
 end if;
 return jsonb_build_object('account',c.account_id,'schedule',c.schedule,'operation',op_key);
end $$;

create function public.v8_tick() returns void
language plpgsql security definer set search_path='' as $$
declare p public.transport_payments; carrier dz_private.carrier_connect;
begin
 if not public.v8_available() then return; end if;
 for p in select t.* from public.transport_payments t join public.transport_inquiries i on i.id=t.inquiry_id
  where (t.state in ('checkout_pending','payment_failed') and t.expires_at<=clock_timestamp())
    or (t.state in ('paid','partially_refunded') and t.kind='quick_deal' and t.partner_id is null and t.expires_at<=clock_timestamp())
    or (t.state in ('paid','partially_refunded') and t.delivered_at+make_interval(hours=>(select confirmation_hours from dz_private.payment_settings))<=clock_timestamp()
     and t.confirmed_at is null and t.review_reason is null)
  order by t.created_at limit 100 for update of i skip locked
 loop
  select * into p from public.transport_payments where id=p.id for update;
  if p.state in ('checkout_pending','payment_failed') and p.expires_at<=clock_timestamp() then
   perform dz_private.payment_enqueue(p.id,p.partner_id,'expire','expire:'||p.id);
  elsif p.state in ('paid','partially_refunded') and p.kind='quick_deal' and p.partner_id is null and p.expires_at<=clock_timestamp() then
   update public.transport_payments set state='refund_pending' where id=p.id;
   update dz_private.quick_deals set cancelled_at=clock_timestamp() where id=p.deal_id;
   update public.transport_inquiries set status='cancelled' where id=p.inquiry_id;
   perform dz_private.payment_enqueue(p.id,null,'refund','refund:'||p.id||':'||p.refunded_minor,
    jsonb_build_object('amount',p.gross_minor-p.refunded_minor));
   perform dz_private.payment_log(p.id,'quick_deal_expired');
  elsif p.delivered_at is not null and p.confirmed_at is null and p.review_reason is null then
   update public.transport_payments set review_reason='confirmation_overdue' where id=p.id;
   perform dz_private.payment_log(p.id,'confirmation_overdue');
  end if;
 end loop;
 for carrier in select * from dz_private.carrier_connect c where c.schedule='manual'
  and c.manual_since<=clock_timestamp()-interval '60 days' for update skip locked
 loop
  if not exists(select 1 from dz_private.payment_operations where partner_id=carrier.partner_id and kind in ('schedule','payout')
    and status in ('queued','running','review')) then
   perform dz_private.payment_enqueue(null,carrier.partner_id,'schedule','fallback:'||carrier.partner_id||':'||extract(epoch from carrier.manual_since),
    '{"schedule":"weekly"}');
  end if;
 end loop;
end $$;

create function public.v8_claim_operation(p_key text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare op dz_private.payment_operations; result jsonb; candidate uuid; related uuid;
begin
 if not public.v8_available() then return null; end if;
 update dz_private.payment_operations set status='review',error='Stripe reconciliation required before retry'
 where status in ('queued','running') and first_attempt_at<clock_timestamp()-interval '23 hours'
  and attempted_at<clock_timestamp()-interval '2 minutes';
 select o.id,p.inquiry_id into candidate,related
 from dz_private.payment_operations o left join public.transport_payments p on p.id=o.payment_id
 where (p_key is null or operation_key=p_key)
 and (o.status='queued' or (o.status='running' and attempted_at<clock_timestamp()-interval '2 minutes'))
 and (o.kind<>'expire' or exists(select 1 from dz_private.payment_operations c
  where c.payment_id=p.id and c.kind='checkout' and c.status='done'))
 and (o.kind<>'transfer' or (p.state in ('paid','partially_refunded') and p.confirmed_at is not null
  and not p.card_dispute and not p.delivery_dispute and p.review_reason is null
  and exists(select 1 from dz_private.carrier_connect c where c.partner_id=o.partner_id and c.account_id is not null)))
 order by o.created_at limit 1;
 if candidate is null then return (select result from dz_private.payment_operations where operation_key=p_key and status='done'); end if;
 if related is not null then
  perform 1 from public.transport_inquiries where id=related for update skip locked;
  if not found then return null; end if;
 end if;
 select * into op from dz_private.payment_operations where id=candidate
  and (status='queued' or (status='running' and attempted_at<clock_timestamp()-interval '2 minutes')) for update skip locked;
 if not found then return null; end if;
 if op.kind='transfer' and not exists(select 1 from public.transport_payments p where p.id=op.payment_id
  and p.state in ('paid','partially_refunded') and p.confirmed_at is not null and not p.card_dispute
  and not p.delivery_dispute and p.review_reason is null) then return null; end if;
 if op.kind='transfer' and op.first_attempt_at is null then
  select jsonb_build_object('amount',p.gross_minor-p.refunded_minor-p.commission_minor-dz_private.payment_expense(p.gross_minor,p.refunded_minor,p.commission_minor,p.processor_fee_minor,p.terms),'refunded_minor',p.refunded_minor)
  into op.payload from public.transport_payments p where p.id=op.payment_id;
 end if;
 update dz_private.payment_operations set status='running',attempted_at=clock_timestamp(),
  first_attempt_at=coalesce(first_attempt_at,clock_timestamp()),payload=op.payload where id=op.id;
 select jsonb_build_object('operation',to_jsonb(op),'payment',to_jsonb(p),'stripe',to_jsonb(s),'connect',to_jsonb(c))
 into result from dz_private.payment_operations o left join public.transport_payments p on p.id=o.payment_id
 left join dz_private.payment_stripe s on s.payment_id=p.id
 left join dz_private.carrier_connect c on c.partner_id=o.partner_id where o.id=op.id;
 return result;
end $$;

create function public.v8_finish_operation(p_id uuid,p_result jsonb,p_error text default null,p_preflight boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare op dz_private.payment_operations; p public.transport_payments; reversal integer; related uuid;
begin
 select pmt.inquiry_id into related from dz_private.payment_operations o
 join public.transport_payments pmt on pmt.id=o.payment_id where o.id=p_id;
 if related is not null then perform 1 from public.transport_inquiries where id=related for update; end if;
 select * into strict op from dz_private.payment_operations where id=p_id for update;
 if op.status='done' then return op.result; end if;
 if op.status<>'running' then raise exception 'Unavailable'; end if;
 if p_error is not null then
  update dz_private.payment_operations set error=left(p_error,500),
   first_attempt_at=case when p_preflight then null else first_attempt_at end where id=p_id;
  return null;
 end if;
 select * into p from public.transport_payments where id=op.payment_id;
 if op.kind='checkout' and p_result->>'id' is not null then
  update dz_private.payment_stripe set session_id=p_result->>'id' where payment_id=p.id;
 elsif op.kind='account' then
  update dz_private.carrier_connect set account_id=p_result->>'id' where partner_id=op.partner_id;
 elsif op.kind='schedule' then
  update dz_private.carrier_connect set schedule=op.payload->>'schedule',
   manual_since=case when op.payload->>'schedule'='manual' then coalesce(manual_since,clock_timestamp()) end
  where partner_id=op.partner_id;
 elsif op.kind='transfer' then
  update dz_private.payment_stripe set transfer_id=p_result->>'id',transfer_minor=(p_result->>'amount')::integer where payment_id=p.id;
  update public.transport_payments set settled_at=clock_timestamp() where id=p.id;
  perform dz_private.payment_log(p.id,'commission_settled');
  reversal:=(p_result->>'amount')::integer-(p.gross_minor-p.refunded_minor-p.commission_minor-dz_private.payment_expense(p.gross_minor,p.refunded_minor,p.commission_minor,p.processor_fee_minor,p.terms));
  if reversal>0 and p_result->>'id' is not null then
   perform dz_private.payment_enqueue(p.id,p.partner_id,'reversal','reversal:'||p.id||':'||p.refunded_minor,
    jsonb_build_object('amount',reversal));
  end if;
  if p.card_dispute or p.delivery_dispute then
   update public.transport_payments set review_reason='dispute_during_transfer' where id=p.id;
  end if;
 elsif op.kind='reversal' then
  perform dz_private.payment_log(p.id,'transfer_reversed');
 end if;
 update dz_private.payment_operations set status='done',result=p_result,error=null where id=p_id;
 return p_result;
end $$;

create function public.v8_payment_event(p_event text,p_payment uuid,p_kind text,p_data jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare p public.transport_payments; inquiry uuid; i public.transport_inquiries;
 s dz_private.payment_stripe; refunded integer; reversal integer; next_fee integer;
begin
 if not public.v8_available() then raise exception 'Unavailable'; end if;
 insert into dz_private.stripe_events(event_id) values(p_event) on conflict do nothing;
 if not found then return; end if;
 select inquiry_id into inquiry from public.transport_payments where id=p_payment;
 select * into strict i from public.transport_inquiries where id=inquiry for update;
 select * into strict p from public.transport_payments where id=p_payment for update;
 select * into strict s from dz_private.payment_stripe where payment_id=p.id;
 if p_kind in ('paid','expired','payment_failed') then
  if coalesce(s.session_id,p_data->>'session') is distinct from p_data->>'session'
   or p.gross_minor is distinct from (p_data->>'amount')::integer
   or lower(p.currency) is distinct from p_data->>'currency' then raise exception 'Unexpected Checkout session'; end if;
  if p_kind='paid' and s.charge_id is null then
   update dz_private.payment_stripe set session_id=p_data->>'session',intent_id=p_data->>'intent',
    charge_id=p_data->>'charge',receipt_url=p_data->>'receipt' where payment_id=p.id;
   if p.state='expired' or to_timestamp((p_data->>'captured_at')::bigint)>p.expires_at or p.review_reason='cancellation_requested' or i.status='cancelled' or
     (p.kind='quote' and not exists(select 1 from public.user_roles where user_id=p.partner_id and role='partner' and approved)) then
    update public.transport_payments set state='refund_pending',superseded=(p.state='expired') where id=p.id;
    perform dz_private.payment_enqueue(p.id,p.partner_id,'refund','refund:'||p.id||':0',jsonb_build_object('amount',p.gross_minor));
   elsif p.state in ('checkout_pending','payment_failed') then
    if p.terms->>'stripe_fee_payer'='carrier' and p_data->>'stripe_fee' is null then
     raise exception 'Stripe fee not settled';
    end if;
    update public.transport_payments set state='paid',processor_fee_minor=coalesce((p_data->>'stripe_fee')::integer,0),
    expires_at=case when p.kind='quick_deal' then
     clock_timestamp()+make_interval(hours=>(select quick_deal_hours from dz_private.payment_settings)) else expires_at end
    where id=p.id returning * into p;
    if p.kind='quote' then perform dz_private.v8_accept_paid(p,p.partner_id);
    else update dz_private.quick_deals set published_at=clock_timestamp(),expires_at=p.expires_at where id=p.deal_id;
    end if;
   end if;
  elsif p_kind='expired' and p.state in ('checkout_pending','payment_failed') then
   update public.transport_payments set state='expired' where id=p.id;
   if p.kind='quick_deal' then
    update dz_private.quick_deals set cancelled_at=clock_timestamp() where id=p.deal_id;
    update public.transport_inquiries set status='cancelled' where id=p.inquiry_id;
   end if;
  elsif p_kind='payment_failed' and p.state='checkout_pending' then
   update public.transport_payments set state='payment_failed' where id=p.id;
  else return;
  end if;
 elsif p_kind='refund' then
  if s.charge_id is distinct from p_data->>'charge' then raise exception 'Unexpected refund'; end if;
  refunded:=(p_data->>'refunded')::integer;
  if refunded<=p.refunded_minor then return; end if;
  next_fee:=dz_private.payment_commission(p.gross_minor-refunded,p.rate,p.terms);
  reversal:=(refunded-p.refunded_minor)-coalesce(p.commission_minor-next_fee,0)
   -dz_private.payment_expense(p.gross_minor,p.refunded_minor,p.commission_minor,p.processor_fee_minor,p.terms)
   +dz_private.payment_expense(p.gross_minor,refunded,next_fee,p.processor_fee_minor,p.terms);
  update public.transport_payments set
   state=case when refunded=gross_minor then 'refunded' else 'partially_refunded' end,
   refunded_minor=refunded,commission_minor=next_fee,vat_minor=dz_private.payment_vat(next_fee,p.terms)
  where id=p.id;
  if s.transfer_id is not null and reversal>0 then
   perform dz_private.payment_enqueue(p.id,p.partner_id,'reversal','reversal:'||p.id||':'||refunded,
    jsonb_build_object('amount',reversal));
  elsif exists(select 1 from dz_private.payment_operations where payment_id=p.id and kind='transfer' and status='running') then
   update public.transport_payments set review_reason='refund_during_transfer' where id=p.id;
  end if;
  if refunded=p.gross_minor and not p.superseded and i.status not in ('completed','cancelled') then
   if p.deal_id is not null then update dz_private.quick_deals set cancelled_at=clock_timestamp() where id=p.deal_id; end if;
   update public.transport_inquiries set status='cancelled' where id=p.inquiry_id;
  end if;
 elsif p_kind='refund_failed' then
  update public.transport_payments set review_reason='refund_failed' where id=p.id and state='refund_pending';
 elsif p_kind='card_dispute' then
  update public.transport_payments set card_dispute=(p_data->>'status'<>'won'),
   review_reason=case when p_data->>'status'='won' then
    nullif(review_reason,'card_dispute') else coalesce(review_reason,'card_dispute') end where id=p.id;
 else raise exception 'Unsupported event';
 end if;
 perform dz_private.payment_log(p.id,p_kind,case when p_kind='card_dispute' then p_data::text end);
end $$;

create function public.v8_transfer_event(p_event text,p_payment uuid,p_transfer jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare op dz_private.payment_operations; s dz_private.payment_stripe; account text; inquiry uuid; p public.transport_payments;
begin
 if not public.v8_available() then raise exception 'Unavailable'; end if;
 insert into dz_private.stripe_events(event_id) values(p_event) on conflict do nothing;
 if not found then return; end if;
 select inquiry_id into inquiry from public.transport_payments where id=p_payment;
 perform 1 from public.transport_inquiries where id=inquiry for update;
 select * into strict p from public.transport_payments where id=p_payment for update;
 select * into op from dz_private.payment_operations where operation_key='transfer:'||p_payment;
 select account_id into account from dz_private.carrier_connect where partner_id=op.partner_id;
 select * into s from dz_private.payment_stripe where payment_id=p_payment;
 if op.id is null or account is distinct from p_transfer->>'destination' or
  s.charge_id is distinct from p_transfer->>'source_transaction' or lower(p.currency) is distinct from p_transfer->>'currency' or
  op.payload->>'amount' is distinct from p_transfer->>'amount' then
  update public.transport_payments set review_reason='transfer_mismatch' where id=p_payment;
  perform dz_private.payment_log(p_payment,'transfer_mismatch',p_transfer->>'id');
  return;
 end if;
 if op.status in ('queued','review') and op.first_attempt_at is not null then update dz_private.payment_operations set status='running' where id=op.id; end if;
 perform public.v8_finish_operation(op.id,jsonb_build_object('id',p_transfer->>'id','amount',(p_transfer->>'amount')::integer),null);
end $$;

create function public.v8_payment_reference(p_intent text,p_charge text) returns uuid
language sql stable security definer set search_path='' as $$
 select payment_id from dz_private.payment_stripe where intent_id=p_intent or charge_id=p_charge;
$$;
create function public.v8_payment_details(p_payment uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('receipt',case when p.customer_id=auth.uid() then s.receipt_url end,
  'decisions',case when dz_private.has_role('admin') then (select coalesce(jsonb_agg(jsonb_build_object(
   'event',a.event,'reason',a.reason,'created_at',a.created_at) order by a.id desc),'[]')
   from public.payment_activity a where a.payment_id=p.id and a.reason is not null) end,
  'operations',case when dz_private.has_role('admin') then (select coalesce(jsonb_agg(jsonb_build_object(
   'id',o.id,'kind',o.kind,'status',o.status,'error',o.error)),'[]')
   from dz_private.payment_operations o where o.payment_id=p.id) end)
 from public.transport_payments p join dz_private.payment_stripe s on s.payment_id=p.id
 where p.id=p_payment and (p.customer_id=auth.uid() or dz_private.has_role('admin'));
$$;

create table dz_private.carrier_payout_events (
 payout_id text primary key, partner_id uuid not null references auth.users on delete restrict,
 state text not null, amount_minor integer not null, currency text not null, failure text,
 provider_created_at timestamptz not null, updated_at timestamptz not null default now()
);
alter table dz_private.carrier_payout_events enable row level security;
revoke all on dz_private.carrier_payout_events from public,anon,authenticated;

create function public.v8_connect_event(p_account text,p_event text,p_payout jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare carrier uuid;
begin
 select partner_id into carrier from dz_private.carrier_connect where account_id=p_account;
 if not found then return; end if;
 insert into dz_private.stripe_events(event_id) values(p_event) on conflict do nothing;
 if not found then return; end if;
 insert into dz_private.carrier_payout_events(payout_id,partner_id,state,amount_minor,currency,failure,provider_created_at)
 values(p_payout->>'id',carrier,p_payout->>'status',(p_payout->>'amount')::integer,p_payout->>'currency',
  p_payout->>'failure_message',to_timestamp((p_payout->>'created')::bigint))
 on conflict(payout_id) do update set state=excluded.state,failure=excluded.failure,updated_at=clock_timestamp()
 where dz_private.carrier_payout_events.partner_id=carrier
 and (dz_private.carrier_payout_events.state not in ('paid','failed','canceled') or excluded.state in ('failed','canceled'));
end $$;

create function public.v8_card_failure(p_event text,p_payment uuid,p_amount integer,p_currency text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.v8_available() then raise exception 'Unavailable'; end if;
 insert into dz_private.stripe_events(event_id) values(p_event) on conflict do nothing;
 if not found then return; end if;
 update public.transport_payments set state='payment_failed'
 where id=p_payment and state='checkout_pending' and gross_minor=p_amount and lower(currency)=p_currency;
 if found then perform dz_private.payment_log(p_payment,'payment_failed'); end if;
end $$;

create function public.v8_retry_payment_operation(p_operation uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare op dz_private.payment_operations;
begin
 if not dz_private.has_role('admin') or p_reason is null or length(btrim(p_reason)) not between 3 and 4000 then
  raise exception 'Unavailable';
 end if;
 select * into op from dz_private.payment_operations where id=p_operation and status='running' and error is not null
  and attempted_at<clock_timestamp()-interval '2 minutes'
  and (first_attempt_at is null or first_attempt_at>clock_timestamp()-interval '23 hours') for update;
 if not found then raise exception 'Operation requires reconciliation or is currently running'; end if;
 update dz_private.payment_operations set status='queued' where id=op.id;
 if op.payment_id is not null then perform dz_private.payment_log(op.payment_id,'retry_requested',p_reason); end if;
end $$;

create function public.v8_is_quick_deal(p_deal uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.transport_payments p join dz_private.quick_deal_candidates c on c.deal_id=p.deal_id
 where p.deal_id=p_deal and p.state='paid' and c.partner_id=auth.uid() and c.eligible_until>statement_timestamp()
 and dz_private.has_role('partner'));
$$;

create table dz_private.transport_invoice_files (
 id uuid primary key default gen_random_uuid(),
 payment_id uuid not null unique references public.transport_payments on delete restrict,
 content bytea not null check(octet_length(content) between 5 and 2097152),
 created_at timestamptz not null default now()
);
alter table dz_private.transport_invoice_files enable row level security;
revoke all on dz_private.transport_invoice_files from public,anon,authenticated;

create function public.v8_transport_invoice(p_payment uuid,p_content text) returns text
language plpgsql security definer set search_path='' as $$
declare p public.transport_payments; pdf bytea;
begin
 select * into p from public.transport_payments where id=p_payment and delivered_at is not null;
 if not found or not (coalesce(p.customer_id=auth.uid(),false)
  or (coalesce(p.partner_id=auth.uid(),false) and dz_private.has_role('partner')) or dz_private.has_role('admin'))
 then raise exception 'Unavailable'; end if;
 if p_content is not null then
  if p.partner_id is distinct from auth.uid() or not dz_private.has_role('partner') or length(p_content)>2796204
  then raise exception 'Unavailable'; end if;
  pdf:=decode(p_content,'base64');
  if substring(pdf from 1 for 5)<>decode('255044462d','hex') then raise exception 'Invalid PDF'; end if;
  insert into dz_private.transport_invoice_files(payment_id,content) values(p.id,pdf);
  perform dz_private.payment_log(p.id,'transport_invoice');
  return null;
 end if;
 return (select encode(content,'base64') from dz_private.transport_invoice_files where payment_id=p.id);
end $$;

create function public.v8_monthly_statement(p_month date) returns table (
 payment_id uuid,partner_id uuid,currency text,gross_minor integer,rate integer,fee_minor integer,vat_minor integer,
 expenses_minor integer,net_minor integer,refunded_minor integer,settlement text,commission_draft uuid,transport_invoice uuid
)
language sql stable security definer set search_path='' as $$
 select p.id,p.partner_id,p.currency,p.gross_minor,p.rate,p.commission_minor,p.vat_minor,
  dz_private.payment_expense(p.gross_minor,p.refunded_minor,p.commission_minor,p.processor_fee_minor,p.terms),
  p.gross_minor-p.refunded_minor-p.commission_minor-dz_private.payment_expense(p.gross_minor,p.refunded_minor,p.commission_minor,p.processor_fee_minor,p.terms),p.refunded_minor,
  case when exists(select 1 from dz_private.payment_operations x where x.payment_id=p.id
    and x.kind='reversal' and x.status<>'done') then 'reconciliation'
    when p.state='refunded' then 'refunded' when p.settled_at is not null then 'settled'
    when p.state='expired' then 'void' else 'pending' end,p.id,d.id
 from public.transport_payments p left join dz_private.transport_invoice_files d on d.payment_id=p.id
 where p.created_at>=p_month::timestamp at time zone 'Europe/Ljubljana'
 and p.created_at<(p_month+interval '1 month') at time zone 'Europe/Ljubljana'
 and extract(day from p_month)=1 and p.commission_minor is not null
 and (dz_private.has_role('admin') or (dz_private.has_role('partner') and p.partner_id=auth.uid()))
 order by p.created_at,p.id;
$$;

create function public.v8_admin_payouts() returns table (
 partner_id uuid,amount_minor integer,state text,failure text,created_at timestamptz
)
language sql stable security definer set search_path='' as $$
 select p.partner_id,p.amount_minor,p.state,p.failure,p.provider_created_at from dz_private.carrier_payout_events p
 where dz_private.has_role('admin') order by p.provider_created_at desc limit 100;
$$;

revoke execute on function dz_private.payment_log(uuid,text,text),
 dz_private.payment_enqueue(uuid,uuid,text,text,jsonb),
 dz_private.payment_commission(integer,integer,jsonb),
 dz_private.payment_vat(integer,jsonb),
 dz_private.payment_expense(integer,integer,integer,integer,jsonb),
 dz_private.v8_accept_paid(public.transport_payments,uuid),
 dz_private.open_transport_records(uuid,uuid,uuid,boolean),
 dz_private.v8_status_guard(),dz_private.v8_publish_guard(),dz_private.v8_opportunity_guard(),
 dz_private.load_publication_allowed(uuid),dz_private.v8_load_guard()
 from public,anon,authenticated;

do $$
declare signature text;
begin
 foreach signature in array array['v8_begin_checkout(text,uuid,uuid,jsonb)','v8_accept_quick_deal(uuid,integer,text)',
  'v8_available()','v8_customer_bids()','v8_payment_action(uuid,text,text,integer)','v8_connect_action(text,text,uuid,integer)',
  'v8_payment_details(uuid)','v8_retry_payment_operation(uuid,text)','v8_is_quick_deal(uuid)',
  'v8_transport_invoice(uuid,text)','v8_monthly_statement(date)','v8_admin_payouts()'] loop
  execute format('revoke all on function public.%s from public,anon,authenticated',signature);
  execute format('grant execute on function public.%s to authenticated',signature);
 end loop;
 foreach signature in array array['v8_tick()','v8_claim_operation(text)','v8_finish_operation(uuid,jsonb,text,boolean)',
  'v8_payment_event(text,uuid,text,jsonb)','v8_payment_reference(text,text)','v8_connect_event(text,text,jsonb)','v8_card_failure(text,uuid,integer,text)','v8_transfer_event(text,uuid,jsonb)'] loop
  execute format('revoke all on function public.%s from public,anon,authenticated',signature);
  execute format('grant execute on function public.%s to service_role',signature);
 end loop;
end $$;

commit;
