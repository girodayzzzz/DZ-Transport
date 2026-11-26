begin;
create function public.submit_customer_inquiry(p_request uuid,p_origin text,p_destination text,p_description text,p_name text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare receipt uuid;
begin
 if not dz_private.confirmed() or p_request is null then raise exception 'Unavailable'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select reference into receipt from public.transport_inquiries
 where customer_id=auth.uid() and id=p_request and origin=p_origin and destination=p_destination and description=p_description and contact_name=p_name;
 if found then return receipt; end if;
 if (select count(*) from public.transport_inquiries where customer_id=auth.uid() and created_at>now()-interval '1 hour')>=10 then
  raise exception 'Rate limit';
 end if;
 insert into public.transport_inquiries(id,customer_id,contact_email,origin,destination,description,contact_name)
 select p_request,id,email,p_origin,p_destination,p_description,p_name from auth.users where id=auth.uid()
 returning reference into receipt;
 return receipt;
end $$;

create function public.apply_as_partner(p_name text,p_coverage text,p_services text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not dz_private.confirmed() then raise exception 'Unavailable'; end if;
 insert into public.partner_applications(applicant_id) values(auth.uid());
 insert into public.companies(owner_id,name,coverage,services) values(auth.uid(),p_name,p_coverage,p_services);
 insert into public.notifications(recipient_id,event)
 select user_id,'partner_applied' from public.user_roles where role='admin' and approved;
end $$;

create function public.review_partner(p_application uuid,p_state text)
returns void language plpgsql security definer set search_path='' as $$
declare applicant uuid;
begin
 if not dz_private.has_role('admin') or p_state is null or p_state not in ('approved','rejected','suspended') then
  raise exception 'Unavailable';
 end if;
 update public.partner_applications set state=p_state where id=p_application returning applicant_id into applicant;
 if applicant is null then raise exception 'Unavailable'; end if;
 insert into public.user_roles(user_id,role,approved) values(applicant,'partner',p_state='approved')
 on conflict(user_id,role) do update set approved=excluded.approved;
end $$;

create function public.invite_partner(p_inquiry uuid,p_partner uuid,p_summary text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not dz_private.has_role('admin') then raise exception 'Unavailable'; end if;
 perform 1 from public.transport_inquiries where id=p_inquiry and status='awaiting_carrier_offer' for update;
 if not found or not exists(select 1 from public.user_roles where user_id=p_partner and role='partner' and approved) then
  raise exception 'Unavailable';
 end if;
 insert into public.transport_opportunities(inquiry_id,partner_id,summary) values(p_inquiry,p_partner,p_summary);
end $$;

create function public.submit_carrier_quote(p_opportunity uuid,p_amount integer,p_currency text,p_vat text,p_valid date)
returns void language plpgsql security definer set search_path='' as $$
declare inquiry uuid;
begin
 if not dz_private.has_role('partner') or p_valid is null or p_valid<current_date then raise exception 'Unavailable'; end if;
 select inquiry_id into inquiry from public.transport_opportunities where id=p_opportunity and partner_id=auth.uid();
 perform 1 from public.transport_inquiries where id=inquiry and status='awaiting_carrier_offer' for update;
 if not found or not exists(select 1 from public.transport_opportunities where id=p_opportunity and open) then
  raise exception 'Unavailable';
 end if;
 insert into public.transport_quotes(inquiry_id,opportunity_id,amount_minor,currency,vat_treatment,valid_until,status)
 values(inquiry,p_opportunity,p_amount,p_currency,p_vat,p_valid,'sent');
end $$;

create function public.prepare_customer_offer(p_inquiry uuid,p_amount integer,p_currency text,p_vat text,p_valid date,p_carrier integer,p_expenses integer)
returns void language plpgsql security definer set search_path='' as $$
declare quote uuid; customer uuid;
begin
 if not dz_private.has_role('admin') or p_valid is null or p_valid<current_date then raise exception 'Unavailable'; end if;
 update public.transport_inquiries set status='offer_prepared' where id=p_inquiry and status='awaiting_carrier_offer'
 returning customer_id into customer;
 if not found then raise exception 'Unavailable'; end if;
 update public.transport_opportunities set open=false where inquiry_id=p_inquiry and open;
 insert into public.transport_quotes(inquiry_id,amount_minor,currency,vat_treatment,valid_until)
 values(p_inquiry,p_amount,p_currency,p_vat,p_valid) returning id into quote;
 insert into public.quote_costs(quote_id,carrier_minor,expenses_minor) values(quote,p_carrier,p_expenses);
 insert into public.notifications(recipient_id,event) values(auth.uid(),'offer_prepared');
end $$;

create function public.advance_transport(p_inquiry uuid,p_next public.transport_status)
returns void language plpgsql security definer set search_path='' as $$
declare previous public.transport_status;
begin
 if not dz_private.has_role('admin') and not dz_private.assigned(p_inquiry) then raise exception 'Unavailable'; end if;
 select status into previous from public.transport_inquiries where id=p_inquiry for update;
 if not found or p_next is null then raise exception 'Unavailable'; end if;
 if dz_private.has_role('admin') and p_next='cancelled' and previous not in ('delivered','completed','cancelled') then
  update public.transport_quotes set status='withdrawn'
  where inquiry_id=p_inquiry and opportunity_id is null and status in ('draft','sent');
  update public.transport_opportunities set open=false where inquiry_id=p_inquiry and open;
 elsif dz_private.has_role('admin') and (previous,p_next) in (
  ('new_inquiry','under_review'),('under_review','awaiting_carrier_offer'),('offer_prepared','offer_sent'),
  ('carrier_assigned','scheduled'),('delivered','completed')) then
  if p_next='offer_sent' then
   update public.transport_quotes set status='sent'
   where inquiry_id=p_inquiry and opportunity_id is null and status='draft' and valid_until>=current_date;
   if not found then raise exception 'Offer unavailable'; end if;
  end if;
 elsif (previous,p_next) not in (('scheduled','picked_up'),('picked_up','in_transit'),('in_transit','delivered')) then
  raise exception 'Invalid transition';
 end if;
 update public.transport_inquiries set status=p_next where id=p_inquiry;
end $$;

create function dz_private.accept_offer(p_quote uuid,p_inquiry uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.transport_inquiries where id=p_inquiry and status='offer_sent' for update;
 if not found then raise exception 'Unavailable'; end if;
 update public.transport_quotes set status='accepted' where id=p_quote and inquiry_id=p_inquiry and
  opportunity_id is null and status='sent' and valid_until>=current_date;
 if not found then raise exception 'Unavailable'; end if;
 insert into public.transport_orders(inquiry_id,quote_id) values(p_inquiry,p_quote);
 update public.transport_inquiries set status='customer_accepted' where id=p_inquiry;
 insert into public.notifications(recipient_id,event)
 select user_id,'offer_accepted' from public.user_roles where role='admin' and approved;
end $$;
revoke execute on function dz_private.accept_offer(uuid,uuid) from public,anon,authenticated;

create function public.accept_customer_offer(p_quote uuid)
returns void language plpgsql security definer set search_path='' as $$
declare inquiry uuid;
begin
 select inquiry_id into inquiry from public.transport_quotes where id=p_quote and opportunity_id is null;
 if not dz_private.owns_inquiry(inquiry) then raise exception 'Unavailable'; end if;
 perform dz_private.accept_offer(p_quote,inquiry);
end $$;

create function public.record_guest_acceptance(p_quote uuid,p_evidence text)
returns void language plpgsql security definer set search_path='' as $$
declare inquiry uuid;
begin
 if not dz_private.has_role('admin') or p_evidence is null or length(trim(p_evidence)) not between 12 and 4000 then
  raise exception 'Unavailable';
 end if;
 select i.id into inquiry from public.transport_inquiries i
 join public.transport_quotes q on q.inquiry_id=i.id
 where q.id=p_quote and q.opportunity_id is null and i.customer_id is null;
 if not found then raise exception 'Unavailable'; end if;
 perform dz_private.accept_offer(p_quote,inquiry);
 insert into public.internal_notes(inquiry_id,author_id,body) values(inquiry,auth.uid(),p_evidence);
end $$;

create function public.assign_transport(p_order uuid,p_partner uuid,p_instructions text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not dz_private.has_role('admin') or not exists(select 1 from public.user_roles where user_id=p_partner and role='partner' and approved) then
  raise exception 'Unavailable';
 end if;
 update public.transport_inquiries i set status='carrier_assigned' from public.transport_orders o
 where o.id=p_order and i.id=o.inquiry_id and i.status='customer_accepted';
 if not found then raise exception 'Unavailable'; end if;
 insert into public.transport_assignments(order_id,partner_id,instructions) values(p_order,p_partner,p_instructions);
end $$;

create function public.archive_inquiry(p_inquiry uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not dz_private.has_role('admin') then raise exception 'Unavailable'; end if;
 update public.transport_inquiries set archived_at=now() where id=p_inquiry and archived_at is null and status in ('completed','cancelled');
 if not found then raise exception 'Unavailable'; end if;
end $$;

create policy admin_note on public.internal_notes for insert to authenticated with check (
 author_id=(select auth.uid()) and (select dz_private.has_role('admin')));
grant insert(inquiry_id,body) on public.internal_notes to authenticated;

create function public.mark_notification_read(p_notification uuid)
returns void language sql security definer set search_path='' as $$
 update public.notifications set read_at=now()
 where id=p_notification and recipient_id=auth.uid() and read_at is null and dz_private.confirmed()
 and (event='status_changed' or dz_private.has_role('admin'));
$$;

create function public.manager_financials()
returns table(currency text, revenue_minor bigint, carrier_minor bigint, expenses_minor bigint, profit_minor bigint, margin_percent numeric)
language sql stable security definer set search_path='' as $$
 select q.currency,sum(q.amount_minor),sum(c.carrier_minor),sum(c.expenses_minor),
 sum(q.amount_minor::bigint-c.carrier_minor-c.expenses_minor),
 round(sum(q.amount_minor::numeric-c.carrier_minor-c.expenses_minor)*100/nullif(sum(q.amount_minor),0),2)
 from public.transport_quotes q join public.quote_costs c on c.quote_id=q.id
 join public.transport_inquiries i on i.id=q.inquiry_id
 where dz_private.has_role('admin') and q.status='accepted' and i.status='completed'
 group by q.currency;
$$;

create function public.manager_counts()
returns table(new_inquiries bigint,open_offers bigint,active_transports bigint,completed_transports bigint,pending_partners bigint)
language sql stable security definer set search_path='' as $$
 select count(*) filter (where status='new_inquiry'),
 count(*) filter (where status in ('offer_prepared','offer_sent')),
 count(*) filter (where status in ('carrier_assigned','scheduled','picked_up','in_transit','delivered')),
 count(*) filter (where status='completed'),
 (select count(*) from public.partner_applications where state='pending')
 from public.transport_inquiries
 having dz_private.has_role('admin');
$$;

create function public.update_company_coverage(p_owner uuid,p_services text,p_coverage text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not dz_private.has_role('admin') then raise exception 'Unavailable'; end if;
 update public.companies set services=p_services,coverage=p_coverage where owner_id=p_owner;
 if not found then raise exception 'Unavailable'; end if;
end $$;

create table public.account_deletion_requests (
 id uuid primary key default gen_random_uuid(),
 user_id uuid unique not null references auth.users on delete cascade default auth.uid(),
 created_at timestamptz not null default now()
);
alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from public,anon,authenticated;
grant select,insert(user_id) on public.account_deletion_requests to authenticated;
create policy delete_request_read on public.account_deletion_requests for select to authenticated using (
 (user_id=(select auth.uid()) and (select dz_private.confirmed())) or (select dz_private.has_role('admin')));
create policy delete_request_insert on public.account_deletion_requests for insert to authenticated with check (
 user_id=(select auth.uid()) and (select dz_private.confirmed()));
create trigger audit after insert or delete on public.account_deletion_requests for each row execute function dz_private.audit();

do $$
declare signature regprocedure;
begin
 for signature in
  select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('submit_customer_inquiry','apply_as_partner','review_partner','invite_partner',
  'submit_carrier_quote','prepare_customer_offer','advance_transport','accept_customer_offer','assign_transport',
  'archive_inquiry','mark_notification_read','manager_financials','manager_counts','record_guest_acceptance','update_company_coverage')
 loop
  execute format('revoke execute on function %s from public, anon, authenticated',signature);
  execute format('grant execute on function %s to authenticated',signature);
 end loop;
end $$;
commit;
