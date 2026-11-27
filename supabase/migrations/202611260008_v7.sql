begin;

create table dz_private.carrier_plans (
 partner_id uuid primary key references auth.users on delete cascade,
 plan text not null check (plan in ('free','basic','pro'))
);
create function dz_private.carrier_plan(p_partner uuid) returns text
language sql stable set search_path='' as $$
 select coalesce((select plan from dz_private.carrier_plans where partner_id=p_partner),'free');
$$;
create function dz_private.fee_rate(p_plan text) returns integer
language sql immutable set search_path='' as $$
 select case p_plan when 'free' then 10 when 'basic' then 7 when 'pro' then 5 end;
$$;
create function public.my_carrier_plan() returns text
language sql stable security definer set search_path='' as $$
 select dz_private.carrier_plan(auth.uid()) where dz_private.has_role('partner');
$$;
create function public.set_carrier_plan(p_partner uuid,p_plan text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not dz_private.has_role('admin') then raise exception 'Unavailable'; end if;
 perform 1 from public.user_roles where user_id=p_partner and role='partner' and approved for update;
 if not found then raise exception 'Unavailable'; end if;
 insert into dz_private.carrier_plans values(p_partner,p_plan)
 on conflict(partner_id) do update set plan=excluded.plan;
 insert into public.audit_logs(actor_id,entity,record_id,action)
 values(auth.uid(),'carrier_plan',p_partner,p_plan);
end $$;

create table dz_private.quote_fee_terms (
 quote_id uuid primary key references public.transport_quotes on delete cascade,
 plan text not null
);
alter table dz_private.quick_deal_candidates add column fee_plan text;
alter table dz_private.carrier_plans enable row level security;
alter table dz_private.quote_fee_terms enable row level security;
revoke all on dz_private.carrier_plans,dz_private.quote_fee_terms from public,anon,authenticated;

create function public.submit_carrier_quote(p_opportunity uuid,p_amount integer,p_currency text,p_vat text,p_valid date,p_plan text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not dz_private.has_role('partner') or p_plan is distinct from dz_private.carrier_plan(auth.uid()) then
  raise exception 'Carrier terms changed';
 end if;
 perform public.submit_carrier_quote(p_opportunity,p_amount,p_currency,p_vat,p_valid);
 insert into dz_private.quote_fee_terms
 select id,p_plan from public.transport_quotes where opportunity_id=p_opportunity;
end $$;
revoke execute on function public.submit_carrier_quote(uuid,integer,text,text,date) from public,anon,authenticated;

create function public.request_quick_deal(p_deal uuid,p_amount integer,p_currency text,p_plan text)
returns void language plpgsql security definer set search_path='' as $$
declare deal dz_private.quick_deals;
begin
 if not dz_private.has_role('partner') then raise exception 'Unavailable'; end if;
 deal:=dz_private.lock_quick_deal(p_deal);
 if (deal.carrier_minor,deal.currency,dz_private.carrier_plan(auth.uid()))
 is distinct from (p_amount,p_currency,p_plan) then raise exception 'Carrier terms changed'; end if;
 perform public.request_quick_deal(p_deal);
 update dz_private.quick_deal_candidates set fee_plan=p_plan
 where deal_id=p_deal and partner_id=auth.uid();
end $$;
revoke execute on function public.request_quick_deal(uuid) from public,anon,authenticated;

create table public.carrier_fee_terms (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.transport_orders on delete cascade,
 partner_id uuid not null references auth.users on delete cascade,
 amount_minor integer not null check (amount_minor between 0 and 1000000000),
 currency text not null check (currency in ('EUR','CHF','GBP')),
 plan text not null,
 accepted_at timestamptz,
 created_at timestamptz not null default now(),
 unique(order_id,partner_id)
);
create table public.carrier_fees (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.transport_orders on delete cascade,
 assignment_id uuid not null references public.transport_assignments on delete cascade,
 partner_id uuid references auth.users on delete set null,
 reference uuid not null,
 plan text not null,
 rate integer not null,
 base_minor integer not null,
 fee_minor integer generated always as ((base_minor::bigint*rate+50)/100) stored,
 currency text not null,
 created_at timestamptz not null default now(),
 voided_at timestamptz,
 voided_by uuid references auth.users on delete set null,
 void_reason text,
 billing_reference text
);
create unique index carrier_fees_active on public.carrier_fees(order_id) where voided_at is null;
create index on public.carrier_fees(partner_id,created_at desc);

create table public.transport_conversations (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.transport_orders on delete cascade,
 assignment_id uuid not null references public.transport_assignments on delete cascade,
 partner_id uuid references auth.users on delete set null,
 reference uuid not null,
 closed_at timestamptz,
 created_at timestamptz not null default now()
);
create unique index transport_conversations_current on public.transport_conversations(order_id) where closed_at is null;
create table public.transport_messages (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null references public.transport_conversations on delete cascade,
 sender_id uuid references auth.users on delete set null,
 request_id uuid not null,
 body text not null check (length(trim(body)) between 1 and 4000),
 created_at timestamptz not null default now(),
 unique(conversation_id,sender_id,request_id)
);
create index on public.transport_messages(conversation_id,created_at);
alter table public.notifications add column conversation_id uuid references public.transport_conversations on delete cascade;
alter table public.notifications drop constraint notifications_event_check,
 add constraint notifications_event_check check (event in ('inquiry_received','partner_applied','offer_prepared','offer_accepted',
 'status_changed','quick_deal_requested','quick_deal_reserved','transport_message'));

create function dz_private.can_chat(p_conversation uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select dz_private.confirmed() and not exists(
  select 1 from public.user_roles where user_id=auth.uid() and role='admin' and approved
 ) and exists(
  select 1 from public.transport_conversations c
  join public.transport_orders o on o.id=c.order_id
  join public.transport_inquiries i on i.id=o.inquiry_id
  join public.transport_assignments a on a.id=c.assignment_id
  where c.id=p_conversation and c.closed_at is null and a.partner_id=c.partner_id
   and i.customer_id is not null
   and (i.customer_id=auth.uid() or (c.partner_id=auth.uid() and dz_private.has_role('partner')))
 );
$$;
alter policy own_notifications on public.notifications using (
 recipient_id=(select auth.uid()) and (select dz_private.confirmed())
 and ((event='status_changed' or (event='transport_message' and dz_private.can_chat(conversation_id))) or (event='quick_deal_reserved' and (select dz_private.has_role('partner')))
  or (select dz_private.has_role('admin'))));
create or replace function public.mark_notification_read(p_notification uuid)
returns void language sql security definer set search_path='' as $$
 update public.notifications set read_at=now()
 where id=p_notification and recipient_id=auth.uid() and read_at is null and dz_private.confirmed()
 and ((event='status_changed' or (event='transport_message' and dz_private.can_chat(conversation_id))) or (event='quick_deal_reserved' and dz_private.has_role('partner'))
  or dz_private.has_role('admin'));
$$;

create function public.send_transport_message(p_conversation uuid,p_request uuid,p_body text) returns void
language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
 if not dz_private.can_chat(p_conversation) then raise exception 'Unavailable'; end if;
 -- Serialize sending with reassignment using the inquiry lock.
 select case when i.customer_id=auth.uid() then c.partner_id else i.customer_id end
 into recipient from public.transport_conversations c
 join public.transport_orders o on o.id=c.order_id
 join public.transport_inquiries i on i.id=o.inquiry_id
 where c.id=p_conversation for update of i;
 if not dz_private.can_chat(p_conversation) then raise exception 'Unavailable'; end if;
 insert into public.transport_messages(conversation_id,sender_id,request_id,body)
 values(p_conversation,auth.uid(),p_request,trim(p_body))
 on conflict(conversation_id,sender_id,request_id) do nothing;
 if found and recipient is not null then
  insert into public.notifications(recipient_id,event,conversation_id)
  values(recipient,'transport_message',p_conversation);
 end if;
end $$;

create function public.propose_carrier_fee_terms(p_order uuid,p_partner uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not dz_private.has_role('admin') then raise exception 'Unavailable'; end if;
 perform 1 from public.transport_orders o join public.transport_inquiries i on i.id=o.inquiry_id
 where o.id=p_order and i.status in ('customer_accepted','carrier_assigned','scheduled')
 and not exists(select 1 from public.transport_assignments a where a.order_id=o.id and a.partner_id=p_partner)
 for update of i;
 if not found then raise exception 'Unavailable'; end if;
 insert into public.carrier_fee_terms(order_id,partner_id,amount_minor,currency,plan)
 select o.id,p_partner,coalesce(d.carrier_minor,c.carrier_minor),q.currency,dz_private.carrier_plan(p_partner)
 from public.transport_orders o join public.transport_inquiries i on i.id=o.inquiry_id
 join public.transport_quotes q on q.id=o.quote_id join public.quote_costs c on c.quote_id=q.id
 join public.user_roles r on r.user_id=p_partner and r.role='partner' and r.approved
 left join dz_private.quick_deals d on d.inquiry_id=i.id and d.reserved_partner=p_partner
  and d.reserved_until>clock_timestamp() and d.cancelled_at is null and d.assigned_at is null
 where o.id=p_order and i.status in ('customer_accepted','carrier_assigned','scheduled')
 and i.customer_id is distinct from p_partner
 on conflict(order_id,partner_id) do update set amount_minor=excluded.amount_minor,
  currency=excluded.currency,plan=excluded.plan,accepted_at=null
 where (carrier_fee_terms.amount_minor,carrier_fee_terms.currency,carrier_fee_terms.plan)
 is distinct from (excluded.amount_minor,excluded.currency,excluded.plan);
 if not found and not exists(select 1 from public.carrier_fee_terms where order_id=p_order and partner_id=p_partner)
 then raise exception 'Unavailable'; end if;
end $$;
create function public.confirm_carrier_fee_terms(p_terms uuid,p_amount integer,p_currency text,p_plan text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not dz_private.has_role('partner') or p_plan is distinct from dz_private.carrier_plan(auth.uid()) then
  raise exception 'Carrier terms changed';
 end if;
 update public.carrier_fee_terms set accepted_at=coalesce(accepted_at,now())
 where id=p_terms and partner_id=auth.uid() and (amount_minor,currency,plan)=(p_amount,p_currency,p_plan);
 if not found then raise exception 'Carrier terms changed'; end if;
end $$;

create function dz_private.open_transport_records(p_order uuid,p_assignment uuid,p_partner uuid,p_replacement boolean)
returns void language plpgsql set search_path='' as $$
declare ref uuid; amount integer; currency_code text; plan_code text; allowed boolean;
begin
 -- Serialize rate changes with the final assignment.
 perform 1 from public.user_roles where user_id=p_partner and role='partner' and approved for share;
 if not found then raise exception 'Unavailable'; end if;
 plan_code:=dz_private.carrier_plan(p_partner);
 select i.reference,coalesce(d.carrier_minor,c.carrier_minor),q.currency,
  case when d.id is not null then coalesce(k.fee_plan=plan_code,false)
   else coalesce(t.plan=plan_code and b.amount_minor=c.carrier_minor and b.currency=q.currency
    and b.valid_until>=current_date and b.status='sent',false) end
 into ref,amount,currency_code,allowed
 from public.transport_orders o join public.transport_inquiries i on i.id=o.inquiry_id
 join public.transport_quotes q on q.id=o.quote_id join public.quote_costs c on c.quote_id=q.id
 left join dz_private.quick_deals d on d.inquiry_id=i.id and d.reserved_partner=p_partner
  and d.reserved_until>clock_timestamp() and d.cancelled_at is null and d.assigned_at is null and not p_replacement
 left join dz_private.quick_deal_candidates k on k.deal_id=d.id and k.partner_id=p_partner
 left join public.transport_opportunities op on op.inquiry_id=i.id and op.partner_id=p_partner
 left join public.transport_quotes b on b.opportunity_id=op.id
 left join dz_private.quote_fee_terms t on t.quote_id=b.id
 where o.id=p_order;
 if not found then raise exception 'Carrier terms unavailable'; end if;
 if not allowed then
  perform 1 from public.carrier_fee_terms where order_id=p_order and partner_id=p_partner
   and (amount_minor,currency,plan)=(amount,currency_code,plan_code) and accepted_at is not null for share;
  if not found then raise exception 'Carrier must confirm the current terms'; end if;
 end if;
 insert into public.carrier_fees(order_id,assignment_id,partner_id,reference,plan,rate,base_minor,currency)
 values(p_order,p_assignment,p_partner,ref,plan_code,dz_private.fee_rate(plan_code),amount,currency_code);
 insert into public.transport_conversations(order_id,assignment_id,partner_id,reference)
 values(p_order,p_assignment,p_partner,ref);
 delete from public.carrier_fee_terms where order_id=p_order;
end $$;

create function dz_private.on_transport_confirmed() returns trigger
language plpgsql security definer set search_path='' as $$
declare assignment public.transport_assignments;
begin
 select a.* into strict assignment from public.transport_assignments a
 join public.transport_orders o on o.id=a.order_id where o.inquiry_id=new.id;
 perform dz_private.open_transport_records(assignment.order_id,assignment.id,assignment.partner_id,false);
 return new;
end $$;
create trigger v7_transport_confirmed after update of status on public.transport_inquiries
 for each row when (old.status='customer_accepted' and new.status='carrier_assigned')
 execute function dz_private.on_transport_confirmed();

create function public.void_carrier_fee(p_fee uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare inquiry uuid;
begin
 if not dz_private.has_role('admin') or not coalesce(length(trim(p_reason)) between 1 and 500,false) then
  raise exception 'Unavailable';
 end if;
 select i.id into inquiry from public.carrier_fees f join public.transport_orders o on o.id=f.order_id
 join public.transport_inquiries i on i.id=o.inquiry_id
 where f.id=p_fee and i.status='cancelled' for update of i;
 if not found then raise exception 'Unavailable'; end if;
 update public.carrier_fees set voided_at=now(),voided_by=auth.uid(),void_reason=trim(p_reason)
 where id=p_fee and voided_at is null;
 if found then
  insert into public.audit_logs(actor_id,entity,record_id,action) values(auth.uid(),'carrier_fee',p_fee,'void');
 end if;
end $$;

create function public.replace_transport_carrier(p_order uuid,p_partner uuid,p_instructions text,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare assignment public.transport_assignments; inquiry public.transport_inquiries;
begin
 if not dz_private.has_role('admin') or not coalesce(length(trim(p_reason)) between 1 and 500,false) then raise exception 'Unavailable'; end if;
 select i.* into inquiry from public.transport_orders o join public.transport_inquiries i on i.id=o.inquiry_id
 where o.id=p_order and i.status in ('carrier_assigned','scheduled') for update of i;
 if not found or inquiry.customer_id is not distinct from p_partner then raise exception 'Unavailable'; end if;
 select * into strict assignment from public.transport_assignments where order_id=p_order;
 if assignment.partner_id is not distinct from p_partner then raise exception 'Unavailable'; end if;
 update public.carrier_fees set voided_at=now(),voided_by=auth.uid(),void_reason=trim(p_reason)
 where order_id=p_order and voided_at is null;
 update public.transport_conversations set closed_at=now() where order_id=p_order and closed_at is null;
 update public.transport_assignments set partner_id=p_partner,instructions=p_instructions where id=assignment.id;
 perform dz_private.open_transport_records(p_order,assignment.id,p_partner,true);
 insert into public.audit_logs(actor_id,entity,record_id,action)
 values(auth.uid(),'transport_assignment',assignment.id,'replace');
end $$;

alter table public.carrier_fees enable row level security;
alter table public.carrier_fee_terms enable row level security;
alter table public.transport_conversations enable row level security;
alter table public.transport_messages enable row level security;
revoke all on public.carrier_fees,public.carrier_fee_terms,public.transport_conversations,public.transport_messages from public,anon,authenticated;
grant select on public.carrier_fees,public.carrier_fee_terms,public.transport_conversations,public.transport_messages to authenticated;
create policy read_fees on public.carrier_fees for select to authenticated using
 (dz_private.has_role('admin') or (partner_id=auth.uid() and dz_private.confirmed()));
create policy read_fee_terms on public.carrier_fee_terms for select to authenticated using
 (dz_private.has_role('admin') or (partner_id=auth.uid() and dz_private.has_role('partner')));
create policy read_conversations on public.transport_conversations for select to authenticated using (dz_private.can_chat(id));
create policy read_messages on public.transport_messages for select to authenticated using (dz_private.can_chat(conversation_id));

revoke execute on function dz_private.carrier_plan(uuid),dz_private.fee_rate(text),
 dz_private.open_transport_records(uuid,uuid,uuid,boolean),dz_private.on_transport_confirmed() from public,anon,authenticated;
revoke execute on function dz_private.can_chat(uuid) from public,anon;
grant execute on function dz_private.can_chat(uuid) to authenticated;

do $$
declare signature regprocedure;
begin
 foreach signature in array array['public.my_carrier_plan()','public.set_carrier_plan(uuid,text)',
 'public.submit_carrier_quote(uuid,integer,text,text,date,text)','public.request_quick_deal(uuid,integer,text,text)',
 'public.send_transport_message(uuid,uuid,text)','public.propose_carrier_fee_terms(uuid,uuid)',
 'public.confirm_carrier_fee_terms(uuid,integer,text,text)','public.void_carrier_fee(uuid,text)',
 'public.replace_transport_carrier(uuid,uuid,text,text)']::regprocedure[] loop
  execute format('revoke execute on function %s from public,anon,authenticated',signature);
  execute format('grant execute on function %s to authenticated',signature);
 end loop;
end $$;

commit;
