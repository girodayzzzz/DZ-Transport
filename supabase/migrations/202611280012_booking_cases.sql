begin;

-- New offers carry explicit agreed terms. Existing records retain their original workflow.
create table dz_private.booking_offer_terms (
 bid_id uuid primary key references public.transport_quotes on delete cascade,
 customer_quote_id uuid unique references public.transport_quotes on delete set null,
 carrier_id uuid references auth.users on delete set null,
 carrier_name text not null,
 schedule text not null check(length(btrim(schedule)) between 1 and 500),
 conditions text not null check(length(btrim(conditions)) between 1 and 1500),
 plan text not null,
 rate integer not null
);

create table dz_private.booking_agreements (
 order_id uuid primary key references public.transport_orders on delete restrict,
 bid_id uuid not null unique references public.transport_quotes on delete restrict,
 customer_id uuid references auth.users on delete set null,
 carrier_id uuid references auth.users on delete set null,
 terms jsonb not null,
 accepted_at timestamptz not null default clock_timestamp()
);

create table dz_private.booking_cancellations (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.transport_orders on delete restrict,
 requester_id uuid references auth.users on delete set null,
 requester_role text not null check(requester_role in ('customer','carrier')),
 reason text not null check(reason in ('changed_terms','unable','unreachable','mutual','other')),
 description text not null check(length(description)<=1000),
 transport_status public.transport_status not null,
 state text not null default 'cancellation_pending' check(state in
  ('cancellation_pending','cancellation_agreed','cancellation_disputed','cancellation_information','cancellation_review','cancellation_approved','cancellation_rejected')),
 responsible text check(responsible in ('customer','carrier','mutual','disputed')),
 created_at timestamptz not null default clock_timestamp()
);
create unique index booking_one_open_cancellation on dz_private.booking_cancellations(order_id)
 where state not in ('cancellation_approved','cancellation_rejected');

create table dz_private.booking_cancellation_history (
 id bigint generated always as identity primary key,
 case_id uuid not null references dz_private.booking_cancellations on delete restrict,
 actor_id uuid references auth.users on delete set null,
 action text not null,
 detail text not null,
 created_at timestamptz not null default clock_timestamp()
);

create table dz_private.booking_commission_claims (
 id uuid primary key default gen_random_uuid(),
 case_id uuid not null references dz_private.booking_cancellations on delete restrict,
 carrier_id uuid references auth.users on delete set null,
 fee_id uuid unique references public.carrier_fees on delete restrict,
 payment_id uuid unique references public.transport_payments on delete restrict,
 amount_minor integer not null check(amount_minor>0),
 currency text not null,
 request_reason text not null,
 state text not null default 'commission_pending' check(state in ('commission_pending','commission_approved','commission_rejected')),
 decision_reason text,
 decided_by uuid references auth.users on delete set null,
 decided_at timestamptz,
 adjustment text check(adjustment in ('reverse_open_commission','credit_or_refund_review')),
 created_at timestamptz not null default clock_timestamp(),
 check((fee_id is null)<>(payment_id is null))
);

alter table dz_private.booking_offer_terms enable row level security;
alter table dz_private.booking_agreements enable row level security;
alter table dz_private.booking_cancellations enable row level security;
alter table dz_private.booking_cancellation_history enable row level security;
alter table dz_private.booking_commission_claims enable row level security;
revoke all on dz_private.booking_offer_terms,dz_private.booking_agreements,dz_private.booking_cancellations,
 dz_private.booking_cancellation_history,dz_private.booking_commission_claims from public,anon,authenticated;

-- The existing operator-run cleanup may remove unbooked drafts after review.
-- Preserve all booked orders and payment records until a separate retention rule is approved.
create or replace function dz_private.purge_archived_inquiries(p_cutoff timestamptz)
returns bigint language plpgsql set search_path='' as $$
declare removed bigint;
begin
 if p_cutoff is null or p_cutoff>=now() then raise exception 'Invalid cutoff'; end if;
 delete from public.transport_inquiries i
 where i.archived_at<p_cutoff and i.status in ('completed','cancelled')
  and not exists(select 1 from public.transport_orders o where o.inquiry_id=i.id)
  and not exists(select 1 from public.transport_payments p where p.inquiry_id=i.id);
 get diagnostics removed=row_count;
 return removed;
end $$;

create function public.submit_booking_offer(p_opportunity uuid,p_amount integer,p_currency text,p_vat text,p_valid date,
 p_plan text,p_schedule text,p_conditions text) returns void
language plpgsql security definer set search_path='' as $$
declare carrier_name text;
begin
 perform 1 from public.user_roles where user_id=auth.uid() and role='partner' and approved for share;
 if not found then raise exception 'Unavailable'; end if;
 select name into carrier_name from public.companies where owner_id=auth.uid();
 if carrier_name is null then raise exception 'Carrier profile required'; end if;
 if public.v8_available() and (p_currency is distinct from 'EUR' or p_amount not between 50 and 99999999) then
  raise exception 'Unsupported checkout amount or currency';
 end if;
 perform public.submit_carrier_quote(p_opportunity,p_amount,p_currency,p_vat,p_valid,p_plan);
 insert into dz_private.booking_offer_terms(bid_id,carrier_id,carrier_name,schedule,conditions,plan,rate)
 select id,auth.uid(),carrier_name,btrim(p_schedule),btrim(p_conditions),p_plan,dz_private.fee_rate(p_plan)
 from public.transport_quotes where opportunity_id=p_opportunity;
end $$;

create function public.booking_commission_preview(p_amount integer,p_plan text) returns integer
language plpgsql stable security definer set search_path='' as $$
declare cfg dz_private.payment_settings; rate integer;
begin
 if not dz_private.has_role('partner') or p_plan is distinct from dz_private.carrier_plan(auth.uid())
  or p_amount is null or p_amount<=0 then raise exception 'Unavailable'; end if;
 rate:=dz_private.fee_rate(p_plan);
 select * into cfg from dz_private.payment_settings where enabled;
 if not found then return (p_amount::bigint*rate+50)/100; end if;
 return dz_private.payment_commission(p_amount,rate,
  jsonb_build_object('vat_included',cfg.commission_includes_vat,'vat_bps',cfg.commission_vat_bps));
end $$;

alter function public.prepare_customer_offer(uuid,integer,text,text,date,integer,integer) rename to prepare_manual_customer_offer;
revoke execute on function public.prepare_manual_customer_offer(uuid,integer,text,text,date,integer,integer) from public,anon,authenticated;
create function public.prepare_customer_offer(p_inquiry uuid,p_amount integer,p_currency text,p_vat text,p_valid date,
 p_carrier integer,p_expenses integer) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not dz_private.has_role('admin') then raise exception 'Unavailable'; end if;
 perform 1 from public.transport_inquiries where id=p_inquiry for update;
 if exists(select 1 from public.transport_quotes q join dz_private.booking_offer_terms t on t.bid_id=q.id
   join public.transport_inquiries i on i.id=q.inquiry_id where i.id=p_inquiry and i.customer_id is not null
   and q.status='sent' and q.valid_until>=current_date
   and not exists(select 1 from dz_private.quick_deals d where d.inquiry_id=i.id)) then
  raise exception 'Prepare the selected carrier offer';
 end if;
 perform public.prepare_manual_customer_offer(p_inquiry,p_amount,p_currency,p_vat,p_valid,p_carrier,p_expenses);
end $$;
revoke execute on function public.prepare_customer_offer(uuid,integer,text,text,date,integer,integer) from public,anon,authenticated;
grant execute on function public.prepare_customer_offer(uuid,integer,text,text,date,integer,integer) to authenticated;

create function public.prepare_booking_offer(p_bid uuid) returns void
language plpgsql security definer set search_path='' as $$
declare bid public.transport_quotes;
begin
 if not dz_private.has_role('admin') then raise exception 'Unavailable'; end if;
 select q.* into bid from public.transport_quotes q join dz_private.booking_offer_terms t on t.bid_id=q.id
 where q.id=p_bid;
 if not found then raise exception 'Unavailable'; end if;
 perform 1 from public.transport_inquiries where id=bid.inquiry_id and customer_id is not null
  and status='awaiting_carrier_offer' and not public.v8_available()
  and not exists(select 1 from dz_private.quick_deals where inquiry_id=bid.inquiry_id)
  and exists(select 1 from public.transport_opportunities op where op.id=bid.opportunity_id and op.open)
  for update;
 if not found then raise exception 'Unavailable'; end if;
 select * into strict bid from public.transport_quotes where id=p_bid and status='sent' and valid_until>=current_date;
 perform public.prepare_manual_customer_offer(bid.inquiry_id,bid.amount_minor,bid.currency,bid.vat_treatment,bid.valid_until,bid.amount_minor,0);
 update dz_private.booking_offer_terms set customer_quote_id=(select id from public.transport_quotes
  where inquiry_id=bid.inquiry_id and opportunity_id is null and status='draft' order by created_at desc limit 1)
 where bid_id=bid.id;
end $$;

create function public.booking_offer_details(p_quote uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('carrier',t.carrier_name,'amount_minor',q.amount_minor,'currency',q.currency,
  'origin',i.origin,'destination',i.destination,'schedule',t.schedule,'conditions',t.conditions,
  'valid_until',q.valid_until,'vat',q.vat_treatment)
 from dz_private.booking_offer_terms t join public.transport_quotes q on q.id=p_quote
 join public.transport_inquiries i on i.id=q.inquiry_id
 where p_quote in (t.bid_id,t.customer_quote_id)
 and (dz_private.owns_inquiry(i.id) or dz_private.has_role('admin'))
 and q.status in ('sent','accepted','withdrawn')
 and (q.opportunity_id is null or dz_private.has_role('admin') or (public.v8_available() and exists(
  select 1 from public.transport_opportunities op where op.id=q.opportunity_id and op.open)))
 union all
 select jsonb_build_object('legacy_quick_deal',true)
 from public.transport_quotes q join dz_private.quick_deals d on d.inquiry_id=q.inquiry_id
 where q.id=p_quote and q.opportunity_id is null and q.status='sent'
  and (dz_private.owns_inquiry(q.inquiry_id) or dz_private.has_role('admin'));
$$;

create function public.withdraw_booking_offer(p_bid uuid) returns void
language plpgsql security definer set search_path='' as $$
declare inquiry uuid; linked uuid;
begin
 if not dz_private.has_role('partner') then raise exception 'Unavailable'; end if;
 select q.inquiry_id into inquiry from public.transport_quotes q join public.transport_opportunities op on op.id=q.opportunity_id
 where q.id=p_bid and op.partner_id=auth.uid();
 perform 1 from public.transport_inquiries where id=inquiry and status in
  ('awaiting_carrier_offer','offer_prepared','offer_sent') for update;
 if not found or exists(select 1 from public.transport_payments where quote_id=p_bid and state<>'expired' and not superseded)
 then raise exception 'Unavailable'; end if;
 select customer_quote_id into linked from dz_private.booking_offer_terms where bid_id=p_bid;
 update public.transport_quotes set status='withdrawn' where id=p_bid and status='sent';
 if not found then raise exception 'Unavailable'; end if;
 if linked is not null then
  update public.transport_quotes set status='withdrawn' where id=linked and status in ('draft','sent');
  update public.transport_inquiries set status='awaiting_carrier_offer' where id=inquiry;
  update public.transport_opportunities set open=true where inquiry_id=inquiry;
 end if;
end $$;

-- Keep the legacy guest/admin workflow and historic fee rows.
alter function dz_private.accept_offer(uuid,uuid) rename to accept_offer_without_assignment;
create function dz_private.accept_offer(p_quote uuid,p_inquiry uuid) returns void
language plpgsql security definer set search_path='' as $$
declare t dz_private.booking_offer_terms; order_id uuid; i public.transport_inquiries;
begin
 select * into strict i from public.transport_inquiries where id=p_inquiry for update;
 select * into t from dz_private.booking_offer_terms where customer_quote_id=p_quote;
 if not found then
  perform dz_private.accept_offer_without_assignment(p_quote,p_inquiry);
  return;
 end if;
 if exists(select 1 from dz_private.booking_agreements a where a.bid_id=t.bid_id and a.customer_id=i.customer_id) then return; end if;
 perform 1 from public.transport_quotes where id=t.bid_id and status='sent' and valid_until>=current_date for update;
 if not found or not exists(select 1 from public.user_roles where user_id=t.carrier_id and role='partner' and approved)
 then raise exception 'Carrier offer unavailable'; end if;
 perform dz_private.accept_offer_without_assignment(p_quote,p_inquiry);
 select id into strict order_id from public.transport_orders where inquiry_id=p_inquiry;
 insert into public.transport_assignments(order_id,partner_id,instructions)
 values(order_id,t.carrier_id,t.schedule||E'\n'||t.conditions);
 update public.transport_inquiries set status='carrier_assigned' where id=p_inquiry;
end $$;

alter function dz_private.open_transport_records(uuid,uuid,uuid,boolean) rename to open_booking_predecessor;
create function dz_private.open_transport_records(p_order uuid,p_assignment uuid,p_partner uuid,p_replacement boolean)
returns void language plpgsql set search_path='' as $$
declare t dz_private.booking_offer_terms; p public.transport_payments; i public.transport_inquiries; q public.transport_quotes;
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
  insert into public.carrier_fees(order_id,assignment_id,partner_id,reference,plan,rate,base_minor,currency)
  values(p_order,p_assignment,p_partner,i.reference,t.plan,t.rate,q.amount_minor,q.currency);
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

revoke execute on function dz_private.accept_offer(uuid,uuid),dz_private.open_transport_records(uuid,uuid,uuid,boolean)
 from public,anon,authenticated;

-- All case mutations lock the inquiry before changing the case or its ledger.
create function dz_private.booking_party(p_order uuid) returns text
language sql stable security definer set search_path='' as $$
 select case when dz_private.has_role('admin') then 'admin'
  when i.customer_id=auth.uid() and dz_private.confirmed() then 'customer'
  when a.partner_id=auth.uid() and dz_private.has_role('partner') then 'carrier' end
 from public.transport_orders o join public.transport_inquiries i on i.id=o.inquiry_id
 join public.transport_assignments a on a.order_id=o.id where o.id=p_order
$$;

create function dz_private.booking_notice(p_order uuid,p_event text) returns void
language sql security definer set search_path='' as $$
 insert into public.notifications(recipient_id,event)
 select u.id,p_event from public.transport_orders o
 join public.transport_inquiries i on i.id=o.inquiry_id
 join public.transport_assignments a on a.order_id=o.id
 join auth.users u on u.id=a.partner_id or (p_event='booking_cancellation' and u.id=i.customer_id)
  or exists(select 1 from public.user_roles r where r.user_id=u.id and r.role='admin' and r.approved)
 where o.id=p_order and u.id is distinct from auth.uid()
$$;

create function public.request_booking_cancellation(p_order uuid,p_reason text,p_detail text) returns uuid
language plpgsql security definer set search_path='' as $$
declare i public.transport_inquiries; c dz_private.booking_cancellations; party text; case_state text;
begin
 select ti.* into i from public.transport_orders o join public.transport_inquiries ti on ti.id=o.inquiry_id
 where o.id=p_order for update of ti;
 party:=dz_private.booking_party(p_order);
 if not coalesce(party in ('customer','carrier'),false) or p_reason is null
  or p_reason not in ('changed_terms','unable','unreachable','mutual','other')
  or length(coalesce(p_detail,''))>1000 then raise exception 'Unavailable'; end if;
 select * into c from dz_private.booking_cancellations where order_id=p_order
  and state not in ('cancellation_approved','cancellation_rejected');
 if found then
  if c.requester_id=auth.uid() and c.reason=p_reason and c.description=btrim(coalesce(p_detail,'')) then return c.id; end if;
  raise exception 'Cancellation already open';
 end if;
 if exists(select 1 from dz_private.booking_cancellations where order_id=p_order and state='cancellation_approved') then
  raise exception 'Cancellation already resolved';
 end if;
 if exists(select 1 from dz_private.quick_deals where inquiry_id=i.id) or i.status not in ('carrier_assigned','scheduled','picked_up','in_transit','delivered','completed')
  then raise exception 'Unavailable'; end if;
 case_state:=case when i.status in ('picked_up','in_transit','delivered','completed') or exists(
  select 1 from public.transport_payments p join dz_private.payment_operations op on op.payment_id=p.id
   where p.inquiry_id=i.id and op.kind='transfer' and op.first_attempt_at is not null)
  then 'cancellation_review' else 'cancellation_pending' end;
 insert into dz_private.booking_cancellations(order_id,requester_id,requester_role,reason,description,transport_status,state)
 values(p_order,auth.uid(),party,p_reason,btrim(coalesce(p_detail,'')),i.status,case_state) returning * into c;
 insert into dz_private.booking_cancellation_history(case_id,actor_id,action,detail)
 values(c.id,auth.uid(),case_state,'');
 perform dz_private.booking_notice(p_order,'booking_cancellation');
 return c.id;
end $$;

create function public.update_booking_cancellation(p_case uuid,p_action text,p_detail text,p_responsible text default null)
returns void language plpgsql security definer set search_path='' as $$
declare c dz_private.booking_cancellations; i public.transport_inquiries; party text; next_state text;
 detail text:=btrim(coalesce(p_detail,''));
begin
 select ti.* into i from dz_private.booking_cancellations x join public.transport_orders o on o.id=x.order_id
 join public.transport_inquiries ti on ti.id=o.inquiry_id where x.id=p_case for update of ti;
 select * into c from dz_private.booking_cancellations where id=p_case for update;
 party:=dz_private.booking_party(c.order_id);
 if party is null or c.state in ('cancellation_approved','cancellation_rejected') or length(detail)>1000
 then raise exception 'Unavailable'; end if;
 if party='admin' and length(detail)>0 then
  case p_action
   when 'request_info' then next_state:='cancellation_information';
   when 'internal_note' then next_state:=c.state;
   when 'reject' then next_state:='cancellation_rejected';
   when 'approve' then
    if not coalesce(p_responsible in ('customer','carrier','mutual','disputed'),false)
      or i.status='cancelled' then raise exception 'Unavailable'; end if;
    next_state:='cancellation_approved';
   else raise exception 'Unavailable';
  end case;
 elsif party in ('customer','carrier') then
  if p_action='supply' and c.state='cancellation_information' and length(detail)>0 then
   next_state:='cancellation_review';
  elsif party<>c.requester_role and c.state in ('cancellation_pending','cancellation_review','cancellation_information')
   and not exists(select 1 from dz_private.booking_cancellation_history where case_id=p_case and action in ('agree','object')) then
   if p_action='agree' then next_state:='cancellation_agreed';
   elsif p_action='object' and length(detail)>0 then next_state:='cancellation_disputed'; end if;
  end if;
 end if;
 if next_state is null then raise exception 'Unavailable'; end if;
 update dz_private.booking_cancellations set state=next_state,
  responsible=case when next_state='cancellation_approved' then p_responsible end where id=p_case;
 insert into dz_private.booking_cancellation_history(case_id,actor_id,action,detail)
 values(p_case,auth.uid(),p_action,detail);
 if next_state='cancellation_approved' then
  -- Preserve proof of delivery when an administrator resolves a later complaint.
  update public.transport_inquiries set status='cancelled' where id=i.id and status not in ('delivered','completed');
  update public.transport_conversations set closed_at=clock_timestamp() where order_id=c.order_id and closed_at is null;
 end if;
 if p_action<>'internal_note' then perform dz_private.booking_notice(c.order_id,'booking_cancellation'); end if;
end $$;

create function public.request_booking_commission(p_case uuid,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare c dz_private.booking_cancellations; f public.carrier_fees; p public.transport_payments;
 claim uuid; charged_at timestamptz; fee integer; iso text; booking_partner uuid;
begin
 select x.* into c from dz_private.booking_cancellations x join public.transport_orders o on o.id=x.order_id
 join public.transport_inquiries i on i.id=o.inquiry_id where x.id=p_case and x.state='cancellation_approved' for update of i;
 if not found or dz_private.booking_party(c.order_id) is distinct from 'carrier'
  or not coalesce(length(btrim(p_reason)) between 1 and 1000,false) then raise exception 'Unavailable'; end if;
 select id into claim from dz_private.booking_commission_claims where case_id=p_case and carrier_id=auth.uid();
 if found then return claim; end if;
 select * into f from public.carrier_fees where order_id=c.order_id and partner_id=auth.uid() and voided_at is null;
 if found then
  charged_at:=f.created_at; fee:=f.fee_minor; iso:=f.currency;
 else
  select pay.* into p from public.transport_payments pay join public.transport_orders o on o.inquiry_id=pay.inquiry_id
  where o.id=c.order_id and pay.partner_id=auth.uid() and pay.kind='quote' and not pay.superseded
   and pay.state in ('paid','partially_refunded','refund_pending','refunded');
  select coalesce(a.accepted_at,o.created_at) into charged_at from public.transport_orders o
   left join dz_private.booking_agreements a on a.order_id=o.id where o.id=c.order_id;
  fee:=p.commission_minor; iso:=p.currency;
 end if;
 if coalesce(fee,0)<=0 or clock_timestamp()>=charged_at+interval '30 days' then raise exception 'Commission claim unavailable'; end if;
 insert into dz_private.booking_commission_claims(case_id,carrier_id,fee_id,payment_id,amount_minor,currency,request_reason)
 values(p_case,auth.uid(),f.id,p.id,fee,iso,btrim(p_reason)) returning id into claim;
 perform dz_private.booking_notice(c.order_id,'booking_commission');
 return claim;
end $$;

create function public.decide_booking_commission(p_claim uuid,p_approve boolean,p_exception boolean,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare c dz_private.booking_cancellations; claim dz_private.booking_commission_claims; outcome text;
begin
 if not dz_private.has_role('admin') or p_approve is null
  or not coalesce(length(btrim(p_reason)) between 1 and 1000,false) then raise exception 'Unavailable'; end if;
 select x.* into c from dz_private.booking_commission_claims r join dz_private.booking_cancellations x on x.id=r.case_id
 join public.transport_orders o on o.id=x.order_id join public.transport_inquiries i on i.id=o.inquiry_id
 where r.id=p_claim for update of i;
 select * into claim from dz_private.booking_commission_claims where id=p_claim for update;
 if not found or claim.state<>'commission_pending' then raise exception 'Unavailable'; end if;
 if (c.responsible='customer' and not p_approve) or (c.responsible='carrier' and p_approve and p_exception is not true)
 then raise exception 'Decision differs from commission policy'; end if;
 if p_approve then
  outcome:=case when exists(select 1 from public.transport_payments where id=claim.payment_id and settled_at is not null)
   or exists(select 1 from dz_private.payment_operations where payment_id=claim.payment_id and kind='transfer' and first_attempt_at is not null)
   or exists(select 1 from public.carrier_fees where id=claim.fee_id and billing_reference is not null)
   then 'credit_or_refund_review' else 'reverse_open_commission' end;
 end if;
 update dz_private.booking_commission_claims set state=case when p_approve then 'commission_approved' else 'commission_rejected' end,
  decision_reason=btrim(p_reason),decided_by=auth.uid(),decided_at=clock_timestamp(),adjustment=outcome where id=p_claim;
 if outcome='reverse_open_commission' and claim.fee_id is not null then
  update public.carrier_fees set voided_at=clock_timestamp(),voided_by=auth.uid(),void_reason=left(btrim(p_reason),500)
   where id=claim.fee_id and voided_at is null;
 end if;
 perform dz_private.booking_notice(c.order_id,'booking_commission');
end $$;

create function dz_private.booking_blocks_transfer(p_inquiry uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.transport_orders o join dz_private.booking_cancellations c on c.order_id=o.id
  where o.inquiry_id=p_inquiry and c.state<>'cancellation_rejected')
$$;

create function dz_private.booking_fee_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if new.voided_at is distinct from old.voided_at and exists(select 1 from dz_private.booking_cancellations
   where order_id=old.order_id and state='cancellation_approved')
  and not exists(select 1 from dz_private.booking_commission_claims where fee_id=old.id and adjustment='reverse_open_commission')
 then raise exception 'Commission decision required'; end if;
 return new;
end $$;
create trigger booking_fee_guard before update of voided_at on public.carrier_fees
 for each row execute function dz_private.booking_fee_guard();

create function public.booking_order_cases() returns setof jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('order_id',o.id,'inquiry_id',i.id,'reference',i.reference,'origin',i.origin,'destination',i.destination,
  'status',i.status,'party',party.role,'agreement',a.terms,'accepted_at',a.accepted_at,
  'transfer_review',exists(select 1 from dz_private.payment_operations op where op.payment_id=p.id and op.kind='transfer'
    and op.first_attempt_at is not null),
  'customer_payment_state',p.state,'refunded_minor',p.refunded_minor,
  'commission_deadline',case when party.role in ('carrier','admin')
    and coalesce(f.fee_minor,p.commission_minor,0)>0
    then coalesce(f.created_at,a.accepted_at,o.created_at)+interval '30 days' end,
  'cases',coalesce((select jsonb_agg(
   (to_jsonb(c)-'requester_id')||jsonb_build_object(
   'history', (select jsonb_agg(to_jsonb(h)-'actor_id' order by h.id) from dz_private.booking_cancellation_history h
     where h.case_id=c.id and (h.action<>'internal_note' or party.role='admin')),
   'claim',(select to_jsonb(r)-'carrier_id'-'decided_by'-'payment_id'-'fee_id' from dz_private.booking_commission_claims r
     where r.case_id=c.id and party.role in ('admin','carrier'))) order by c.created_at desc)
   from dz_private.booking_cancellations c where c.order_id=o.id),'[]'::jsonb))
 from public.transport_orders o join public.transport_inquiries i on i.id=o.inquiry_id
 cross join lateral (select dz_private.booking_party(o.id) role) party
 left join dz_private.booking_agreements a on a.order_id=o.id
 left join public.carrier_fees f on f.order_id=o.id and f.voided_at is null and party.role in ('carrier','admin')
 left join public.transport_payments p on p.inquiry_id=i.id and p.kind='quote' and not p.superseded and p.state<>'expired'
 where party.role is not null and i.status in ('carrier_assigned','scheduled','picked_up','in_transit','delivered','completed','cancelled')
   and not exists(select 1 from dz_private.quick_deals where inquiry_id=i.id)
 order by exists(select 1 from dz_private.booking_cancellations x where x.order_id=o.id
   and x.state not in ('cancellation_approved','cancellation_rejected')) desc,
   exists(select 1 from dz_private.booking_cancellations x join dz_private.booking_commission_claims r on r.case_id=x.id
    where x.order_id=o.id and r.state='commission_pending') desc, o.created_at desc limit 100
$$;

alter table public.notifications drop constraint notifications_event_check,
 add constraint notifications_event_check check (event in ('inquiry_received','partner_applied','offer_prepared','offer_accepted',
 'status_changed','quick_deal_requested','quick_deal_reserved','transport_message','booking_cancellation','booking_commission'));
alter policy own_notifications on public.notifications using (
 recipient_id=(select auth.uid()) and (select dz_private.confirmed())
 and ((event in ('status_changed','booking_cancellation','booking_commission') and not exists(
   select 1 from public.user_roles r where r.user_id=auth.uid() and r.role='admin' and r.approved))
  or (event='transport_message' and dz_private.can_chat(conversation_id))
  or (event='quick_deal_reserved' and (select dz_private.has_role('partner'))) or (select dz_private.has_role('admin'))));
create or replace function public.mark_notification_read(p_notification uuid)
returns void language sql security definer set search_path='' as $$
 update public.notifications set read_at=now()
 where id=p_notification and recipient_id=auth.uid() and read_at is null and dz_private.confirmed()
 and ((event in ('status_changed','booking_cancellation','booking_commission') and not exists(
   select 1 from public.user_roles r where r.user_id=auth.uid() and r.role='admin' and r.approved))
  or (event='transport_message' and dz_private.can_chat(conversation_id))
  or (event='quick_deal_reserved' and dz_private.has_role('partner')) or dz_private.has_role('admin'));
$$;

revoke execute on function dz_private.booking_party(uuid),dz_private.booking_notice(uuid,text),
 dz_private.booking_blocks_transfer(uuid),dz_private.booking_fee_guard() from public,anon,authenticated;

-- Reuse the V8 operations queue and webhook without changing Checkout or Quick Deal.
create or replace function public.v8_begin_checkout(p_kind text,p_target uuid,p_request uuid,p_input jsonb default '{}') returns uuid
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
  select coalesce(t.plan,plan_code),coalesce(t.rate,fee_rate) into plan_code,fee_rate
   from (select 1) base left join dz_private.booking_offer_terms t on t.bid_id=q.id;
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

create or replace function dz_private.v8_status_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare p public.transport_payments;
begin
 if new.status='cancelled' and exists(select 1 from public.transport_orders o
  where o.inquiry_id=new.id and (exists(select 1 from dz_private.booking_agreements a where a.order_id=o.id)
   or exists(select 1 from dz_private.booking_cancellations c where c.order_id=o.id))) then
  if exists(select 1 from public.transport_orders o join dz_private.booking_cancellations c on c.order_id=o.id
   where o.inquiry_id=new.id and c.state='cancellation_approved') then return new; end if;
  raise exception 'Use booking cancellation';
 end if;
 if new.status='completed' and dz_private.booking_blocks_transfer(new.id) then raise exception 'Cancellation under review'; end if;
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

create or replace function public.v8_payment_action(p_payment uuid,p_action text,p_reason text default null,p_amount integer default null)
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
 if p.kind='quote' and ((p_action='confirm' and dz_private.booking_blocks_transfer(p.inquiry_id))
  or (p_action='cancel' and p.state='paid' and exists(select 1 from public.transport_orders o where o.inquiry_id=p.inquiry_id)))
 then raise exception 'Use booking cancellation'; end if;
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

create or replace function public.v8_claim_operation(p_key text default null) returns jsonb
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
  and not dz_private.booking_blocks_transfer(p.inquiry_id)
  and exists(select 1 from dz_private.carrier_connect c where c.partner_id=o.partner_id and c.account_id is not null)))
 order by o.created_at limit 1;
 if candidate is null then return (select done.result from dz_private.payment_operations done where done.operation_key=p_key and done.status='done'); end if;
 if related is not null then
  perform 1 from public.transport_inquiries where id=related for update skip locked;
  if not found then return null; end if;
 end if;
 select * into op from dz_private.payment_operations where id=candidate
  and (status='queued' or (status='running' and attempted_at<clock_timestamp()-interval '2 minutes')) for update skip locked;
 if not found then return null; end if;
 if op.kind='transfer' and not exists(select 1 from public.transport_payments p where p.id=op.payment_id
  and p.state in ('paid','partially_refunded') and p.confirmed_at is not null and not p.card_dispute
  and not p.delivery_dispute and p.review_reason is null
  and not dz_private.booking_blocks_transfer(p.inquiry_id)) then return null; end if;
 if op.kind='transfer' and op.first_attempt_at is null then
  select jsonb_build_object('amount',greatest(0,p.gross_minor-p.refunded_minor-p.commission_minor-dz_private.payment_expense(p.gross_minor,p.refunded_minor,p.commission_minor,p.processor_fee_minor,p.terms)),'refunded_minor',p.refunded_minor)
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

create or replace function public.v8_finish_operation(p_id uuid,p_result jsonb,p_error text default null,p_preflight boolean default false) returns jsonb
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
  if p.kind='quote' and p.gross_minor-p.refunded_minor<p.commission_minor then
   update public.transport_payments set review_reason='commission_balance_review' where id=p.id;
   perform dz_private.payment_log(p.id,'commission_balance_review');
  else
   update public.transport_payments set settled_at=clock_timestamp() where id=p.id;
   perform dz_private.payment_log(p.id,'commission_settled');
  end if;
  reversal:=(p_result->>'amount')::integer-greatest(0,p.gross_minor-p.refunded_minor-p.commission_minor-dz_private.payment_expense(p.gross_minor,p.refunded_minor,p.commission_minor,p.processor_fee_minor,p.terms));
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

create or replace function public.v8_payment_event(p_event text,p_payment uuid,p_kind text,p_data jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare p public.transport_payments; inquiry uuid; i public.transport_inquiries;
 s dz_private.payment_stripe; refunded integer; reversal integer; next_fee integer; booked_quote boolean;
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
     (p.kind='quote' and not exists(select 1 from public.user_roles where user_id=p.partner_id and role='partner' and approved))
     or exists(select 1 from dz_private.booking_offer_terms t join public.transport_quotes q on q.id=t.bid_id
      where t.bid_id=p.quote_id and (q.status<>'sent' or q.valid_until<
       coalesce((to_timestamp((p_data->>'captured_at')::bigint) at time zone 'UTC')::date,current_date))) then
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
  booked_quote:=p.kind='quote' and exists(select 1 from public.transport_orders o
   where o.inquiry_id=p.inquiry_id and not p.superseded);
  next_fee:=case when booked_quote then p.commission_minor
   else dz_private.payment_commission(p.gross_minor-refunded,p.rate,p.terms) end;
  reversal:=(refunded-p.refunded_minor)-coalesce(p.commission_minor-next_fee,0)
   -dz_private.payment_expense(p.gross_minor,p.refunded_minor,p.commission_minor,p.processor_fee_minor,p.terms)
   +dz_private.payment_expense(p.gross_minor,refunded,next_fee,p.processor_fee_minor,p.terms);
  update public.transport_payments set
   state=case when refunded=gross_minor then 'refunded' else 'partially_refunded' end,
   refunded_minor=refunded,commission_minor=next_fee,vat_minor=dz_private.payment_vat(next_fee,p.terms)
  where id=p.id;
  if booked_quote then
   -- Keep the commission snapshot, but a reversal cannot exceed the remaining carrier proceeds.
   reversal:=greatest(0,p.gross_minor-p.refunded_minor-p.commission_minor
    -dz_private.payment_expense(p.gross_minor,p.refunded_minor,p.commission_minor,p.processor_fee_minor,p.terms))
    -greatest(0,p.gross_minor-refunded-p.commission_minor
     -dz_private.payment_expense(p.gross_minor,refunded,p.commission_minor,p.processor_fee_minor,p.terms));
  end if;
  if s.transfer_id is not null and reversal>0 then
   perform dz_private.payment_enqueue(p.id,p.partner_id,'reversal','reversal:'||p.id||':'||refunded,
    jsonb_build_object('amount',reversal));
  elsif exists(select 1 from dz_private.payment_operations where payment_id=p.id and kind='transfer' and status='running') then
   update public.transport_payments set review_reason='refund_during_transfer' where id=p.id;
  end if;
  if refunded=p.gross_minor and not booked_quote and not p.superseded and i.status not in ('completed','cancelled') then
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

revoke execute on function public.submit_booking_offer(uuid,integer,text,text,date,text,text,text),
 public.booking_commission_preview(integer,text),public.prepare_booking_offer(uuid),public.booking_offer_details(uuid),public.withdraw_booking_offer(uuid),
 public.request_booking_cancellation(uuid,text,text),public.update_booking_cancellation(uuid,text,text,text),
 public.request_booking_commission(uuid,text),public.decide_booking_commission(uuid,boolean,boolean,text),
 public.booking_order_cases() from public,anon,authenticated;
grant execute on function public.submit_booking_offer(uuid,integer,text,text,date,text,text,text),
 public.booking_commission_preview(integer,text),public.prepare_booking_offer(uuid),public.booking_offer_details(uuid),public.withdraw_booking_offer(uuid),
 public.request_booking_cancellation(uuid,text,text),public.update_booking_cancellation(uuid,text,text,text),
 public.request_booking_commission(uuid,text),public.decide_booking_commission(uuid,boolean,boolean,text),
 public.booking_order_cases() to authenticated;
commit;
