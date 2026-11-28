begin;

create table dz_private.carrier_billing (
 carrier_id uuid primary key references auth.users on delete restrict,
 stripe_account text not null check(stripe_account ~ '^acct_[A-Za-z0-9]+$'),
 customer_id text unique check(customer_id ~ '^cus_[A-Za-z0-9]+$'),
 customer_request uuid not null default gen_random_uuid(),
 created_at timestamptz not null default clock_timestamp(),
 attempt uuid unique,
 checkout_plan text check(checkout_plan in ('basic','pro')),
 checkout_language text check(checkout_language in ('sl','en','de')),
 checkout_until timestamptz,
 session_id text unique check(session_id ~ '^cs_live_[A-Za-z0-9]+$'),
 subscription_id text unique check(subscription_id ~ '^sub_[A-Za-z0-9]+$'),
 subscription_plan text check(subscription_plan in ('basic','pro')),
 state text check(state in ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')),
 paid_until timestamptz,
 period_end timestamptz,
 cancel_at_end boolean not null default false,
 revision bigint not null default 0
);
create table dz_private.carrier_billing_events (
 id text primary key check(id ~ '^evt_[A-Za-z0-9]+$'),
 carrier_id uuid not null references dz_private.carrier_billing on delete restrict,
 created_at timestamptz not null default clock_timestamp()
);
alter table dz_private.carrier_billing enable row level security;
alter table dz_private.carrier_billing_events enable row level security;
revoke all on dz_private.carrier_billing,dz_private.carrier_billing_events from public,anon,authenticated,service_role;

-- Only verified, unexpired billing periods govern new commission calculations.
-- Legacy plan assignments and previously assessed fees remain as historical records.
create or replace function dz_private.carrier_plan(p_partner uuid) returns text
language sql stable set search_path='' as $$
 select coalesce((select b.subscription_plan from dz_private.carrier_billing b
  where b.carrier_id=p_partner and b.paid_until>statement_timestamp()
   and exists(select 1 from public.user_roles where user_id=p_partner and role='partner' and approved)), 'free');
$$;
revoke execute on function public.set_carrier_plan(uuid,text) from public,anon,authenticated;

create function public.my_carrier_billing() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('plan',dz_private.carrier_plan(auth.uid()),'subscription_plan',b.subscription_plan,
  'state',coalesce(b.state,case when b.attempt is not null and b.checkout_until>statement_timestamp() then 'checkout' else 'free' end),
  'paid_until',b.paid_until,'period_end',b.period_end,'cancel_at_end',coalesce(b.cancel_at_end,false),
  'has_customer',b.customer_id is not null)
 from (select auth.uid() uid) u left join dz_private.carrier_billing b on b.carrier_id=u.uid
 where dz_private.has_role('partner')
$$;

create function public.carrier_billing_actor() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',auth.uid(),'admin',dz_private.has_role('admin'),'carrier',dz_private.has_role('partner'))
 where dz_private.has_role('admin') or dz_private.has_role('partner')
$$;

create function public.carrier_billing_account(p_carrier uuid,p_account text,p_create boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b dz_private.carrier_billing;
begin
 if not exists(select 1 from public.user_roles where user_id=p_carrier and role='partner' and approved)
  or not exists(select 1 from auth.users where id=p_carrier and email_confirmed_at is not null)
 then raise exception 'Approved carrier required'; end if;
 if p_create then
  insert into dz_private.carrier_billing(carrier_id,stripe_account) values(p_carrier,p_account) on conflict do nothing;
 end if;
 select * into b from dz_private.carrier_billing where carrier_id=p_carrier;
 if not found then return null; end if;
 if b.stripe_account is distinct from p_account then raise exception 'Stripe account mismatch'; end if;
 return to_jsonb(b);
end $$;

create function public.carrier_billing_bind(p_carrier uuid,p_account text,p_customer text) returns void
language plpgsql security definer set search_path='' as $$
begin
 update dz_private.carrier_billing set customer_id=p_customer
 where carrier_id=p_carrier and stripe_account=p_account and p_customer is not null
  and (customer_id is null or customer_id=p_customer);
 if not found then raise exception 'Stripe customer mismatch'; end if;
end $$;

create function public.carrier_billing_reserve(p_carrier uuid,p_account text,p_plan text,p_language text,p_previous uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b dz_private.carrier_billing;
begin
 perform 1 from public.user_roles where user_id=p_carrier and role='partner' and approved for share;
 if not found or not coalesce(p_plan in ('basic','pro'),false)
  or not coalesce(p_language in ('sl','en','de'),false) then raise exception 'Unavailable'; end if;
 select * into strict b from dz_private.carrier_billing
  where carrier_id=p_carrier and stripe_account=p_account and customer_id is not null for update;
 if b.paid_until>clock_timestamp() or b.state not in ('canceled','incomplete_expired') then
  return jsonb_build_object('blocked','subscription');
 end if;
 if b.attempt is not null then
  if b.checkout_until>clock_timestamp() then
   if b.checkout_plan=p_plan then return to_jsonb(b); end if;
   return jsonb_build_object('blocked','checkout');
  end if;
  if b.attempt is distinct from p_previous or b.checkout_until+interval '5 minutes'>clock_timestamp() then
   return jsonb_build_object('blocked','reconcile');
  end if;
 end if;
 update dz_private.carrier_billing set attempt=gen_random_uuid(),checkout_plan=p_plan,checkout_language=p_language,
  checkout_until=date_trunc('second',clock_timestamp()+interval '2 hours'),session_id=null,
  subscription_id=null,subscription_plan=null,state=null,paid_until=null,period_end=null,cancel_at_end=false,revision=revision+1
 where carrier_id=p_carrier returning * into b;
 return to_jsonb(b);
end $$;

create function public.carrier_billing_record_session(p_customer text,p_attempt uuid,p_session text) returns void
language plpgsql security definer set search_path='' as $$
begin
 update dz_private.carrier_billing set session_id=p_session where customer_id=p_customer and attempt=p_attempt
  and p_session is not null and (session_id is null or session_id=p_session);
 if not found then raise exception 'Stripe Checkout mismatch'; end if;
end $$;

create function public.carrier_billing_event_target(p_account text,p_customer text,p_attempt uuid,p_event text)
returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(b) from dz_private.carrier_billing b
 where b.stripe_account=p_account and b.customer_id=p_customer and b.attempt=p_attempt
 and not exists(select 1 from dz_private.carrier_billing_events e where e.id=p_event)
$$;

create function public.carrier_billing_apply(p_account text,p_customer text,p_attempt uuid,p_event text,p_revision bigint,
 p_subscription text,p_plan text,p_state text,p_period_end timestamptz,p_cancel_at_end boolean,p_paid_until timestamptz,p_ended_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare b dz_private.carrier_billing; paid timestamptz;
begin
 select * into b from dz_private.carrier_billing where stripe_account=p_account and customer_id=p_customer for update;
 if not found or b.attempt is distinct from p_attempt
  or exists(select 1 from dz_private.carrier_billing_events where id=p_event) then return; end if;
 if b.revision is distinct from p_revision then raise exception 'Billing state changed; retry'; end if;
 if b.checkout_plan is distinct from p_plan or (b.subscription_id is not null and b.subscription_id<>p_subscription)
 then raise exception 'Subscription does not match reservation'; end if;
 if p_subscription is null or p_state is null or p_period_end is null or p_cancel_at_end is null
  or (p_state='canceled' and p_ended_at is null) then raise exception 'Incomplete subscription'; end if;
 paid:=greatest(b.paid_until,p_paid_until);
 if p_state='canceled' then paid:=case when paid is not null then least(paid,p_ended_at) end; end if;
 update dz_private.carrier_billing set subscription_id=p_subscription,subscription_plan=p_plan,state=p_state,
  period_end=p_period_end,cancel_at_end=p_cancel_at_end,paid_until=paid,revision=revision+1
 where carrier_id=b.carrier_id;
 insert into dz_private.carrier_billing_events(id,carrier_id) values(p_event,b.carrier_id);
end $$;

revoke execute on function public.my_carrier_billing(),public.carrier_billing_actor() from public,anon,authenticated,service_role;
grant execute on function public.my_carrier_billing(),public.carrier_billing_actor() to authenticated;
revoke execute on function public.carrier_billing_account(uuid,text,boolean),public.carrier_billing_bind(uuid,text,text),
 public.carrier_billing_reserve(uuid,text,text,text,uuid),public.carrier_billing_record_session(text,uuid,text),
 public.carrier_billing_event_target(text,text,uuid,text),
 public.carrier_billing_apply(text,text,uuid,text,bigint,text,text,text,timestamptz,boolean,timestamptz,timestamptz)
 from public,anon,authenticated,service_role;
grant execute on function public.carrier_billing_account(uuid,text,boolean),public.carrier_billing_bind(uuid,text,text),
 public.carrier_billing_reserve(uuid,text,text,text,uuid),public.carrier_billing_record_session(text,uuid,text),
 public.carrier_billing_event_target(text,text,uuid,text),
 public.carrier_billing_apply(text,text,uuid,text,bigint,text,text,text,timestamptz,boolean,timestamptz,timestamptz)
 to service_role;

-- Freeze the effective plan at assignment or payment confirmation, including V8 test payments.
create or replace function dz_private.open_transport_records(p_order uuid,p_assignment uuid,p_partner uuid,p_replacement boolean)
returns void language plpgsql set search_path='' as $$
declare t dz_private.booking_offer_terms; p public.transport_payments; i public.transport_inquiries; q public.transport_quotes; current_plan text;
begin
 if p_replacement and (exists(select 1 from dz_private.booking_agreements where order_id=p_order)
  or exists(select 1 from dz_private.booking_cancellations where order_id=p_order))
 then raise exception 'Use booking cancellation'; end if;
 select ti.* into strict i from public.transport_orders o join public.transport_inquiries ti on ti.id=o.inquiry_id where o.id=p_order;
 select * into p from public.transport_payments where inquiry_id=i.id and state='paid' and kind='quote' and not superseded;
 select q1.* into strict q from public.transport_orders o join public.transport_quotes q1 on q1.id=o.quote_id where o.id=p_order;
 select * into t from dz_private.booking_offer_terms where customer_quote_id=q.id or bid_id=p.quote_id;
 if not found then
  perform dz_private.open_booking_predecessor(p_order,p_assignment,p_partner,p_replacement);
  return;
 end if;
 if t.carrier_id is distinct from p_partner then raise exception 'Carrier differs from the agreed offer'; end if;
 if p.id is not null then
  perform dz_private.open_booking_predecessor(p_order,p_assignment,p_partner,p_replacement);
 else
  current_plan:=dz_private.carrier_plan(p_partner);
  insert into public.carrier_fees(order_id,assignment_id,partner_id,reference,plan,rate,base_minor,currency)
  values(p_order,p_assignment,p_partner,i.reference,current_plan,dz_private.fee_rate(current_plan),q.amount_minor,q.currency);
  insert into public.transport_conversations(order_id,assignment_id,partner_id,reference)
  values(p_order,p_assignment,p_partner,i.reference);
 end if;
 update public.transport_quotes set status='accepted' where id=t.bid_id and status='sent';
 if not found then raise exception 'Carrier offer unavailable'; end if;
 insert into dz_private.booking_agreements(order_id,bid_id,customer_id,carrier_id,terms)
 values(p_order,t.bid_id,i.customer_id,p_partner,jsonb_build_object('carrier',t.carrier_name,'amount_minor',q.amount_minor,
  'currency',q.currency,'vat',q.vat_treatment,'origin',i.origin,'destination',i.destination,'schedule',t.schedule,
  'conditions',t.conditions,'customer_fee_minor',0,'valid_until',(select valid_until from public.transport_quotes where id=t.bid_id)));
end $$;

create or replace function dz_private.v8_accept_paid(p public.transport_payments,p_carrier uuid) returns void
language plpgsql set search_path='' as $$
declare q public.transport_quotes; d dz_private.quick_deals; offer uuid; transport_order uuid; current_plan text; current_rate integer; current_fee integer;
begin
 if not exists(select 1 from public.user_roles where user_id=p_carrier and role='partner' and approved)
  or p_carrier=p.customer_id then raise exception 'Unavailable'; end if;
 current_plan:=dz_private.carrier_plan(p_carrier);
 current_rate:=dz_private.fee_rate(current_plan);
 current_fee:=dz_private.payment_commission(p.gross_minor,current_rate,p.terms);
 update public.transport_payments set plan=current_plan,rate=current_rate,commission_minor=current_fee,
  vat_minor=dz_private.payment_vat(current_fee,p.terms) where id=p.id;
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

commit;
