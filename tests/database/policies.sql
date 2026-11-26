begin;
insert into auth.users values
 ('00000000-0000-0000-0000-000000000001','customer@example.invalid',now()),
 ('00000000-0000-0000-0000-000000000002','other@example.invalid',now()),
 ('00000000-0000-0000-0000-000000000003','carrier@example.invalid',now()),
 ('00000000-0000-0000-0000-000000000004','admin@example.invalid',now()),
 ('00000000-0000-0000-0000-000000000005','unverified@example.invalid',null);
insert into public.user_roles(user_id,role,approved) values('00000000-0000-0000-0000-000000000004','admin',true);

set local role anon;
do $$
begin
 begin perform public.choose_customer_account_type('private_customer'); raise exception 'Anonymous onboarding allowed';
 exception when insufficient_privilege then null; end;
 begin perform id from public.transport_inquiries; raise exception 'Anonymous read allowed';
 exception when insufficient_privilege then null; end;
 begin perform public.submit_customer_inquiry(gen_random_uuid(),'A','B','test'); raise exception 'Anonymous RPC allowed';
 exception when insufficient_privilege then null; end;
end $$;

set local role service_role;
select public.ingest_guest_inquiry('DZT-20261126-123ABC',repeat('0',64),'customer@example.invalid','SI','DE','car','{}') as guest_receipt \gset
select public.ingest_guest_inquiry('DZT-20261126-123ABC',repeat('0',64),'customer@example.invalid','SI','DE','car','{}')=:'guest_receipt'::uuid as duplicate_ok \gset
\if :duplicate_ok
\else
 \quit 1
\endif
do $$
begin
 begin
  perform public.ingest_guest_inquiry('DZT-20261126-123ABC',repeat('0',64),'customer@example.invalid','SI','DE','car','{"changed":true}');
  raise exception 'Conflicting replay allowed' using errcode='XX000';
 exception when raise_exception then null; end;
 for i in 1..7 loop
  perform public.ingest_guest_inquiry('DZT-20261126-RATE0'||i,repeat('0',64),'guest@example.invalid','SI','DE','car','{}');
 end loop;
 begin
  perform public.ingest_guest_inquiry('DZT-20261126-RATE08',repeat('0',64),'guest@example.invalid','SI','DE','car','{}');
  raise exception 'Rate limit bypass';
 exception when no_data_found then null; end;
end $$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000005","aal":"aal1"}',true);
do $$
begin
 begin perform public.submit_customer_inquiry(gen_random_uuid(),'A','B','test');
  raise exception 'Unconfirmed account submitted' using errcode='XX000';
 exception when raise_exception then null; end;
end $$;

select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","aal":"aal1"}',true);
do $$
declare a uuid;b uuid;
begin
 a:=public.submit_customer_inquiry('10000000-0000-0000-0000-000000000001','Ljubljana','Berlin','Synthetic order');
 b:=public.submit_customer_inquiry('10000000-0000-0000-0000-000000000001','Ljubljana','Berlin','Synthetic order');
 if a is null or a<>b or (select count(*) from public.transport_inquiries)<>1 then raise exception 'Customer isolation or replay'; end if;
 begin
  insert into public.user_roles(user_id,role,approved) values(auth.uid(),'admin',true);
  raise exception 'Self-promotion allowed';
 exception when insufficient_privilege then null; end;
 begin
  perform public.ingest_guest_inquiry('DZT-20261126-ABC123',repeat('0',64),'x@example.invalid','SI','DE','car','{}');
  raise exception 'Guest service RPC exposed';
 exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000002","aal":"aal1"}',true);
do $$
begin
 if exists(select 1 from public.transport_inquiries) then raise exception 'Cross-customer inquiry read'; end if;
end $$;

select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000003","aal":"aal1"}',true);
select public.apply_as_partner('Synthetic carrier','SI and DE','Vehicle transport');
do $$
begin
 if exists(select 1 from public.transport_opportunities) then raise exception 'Pending partner access'; end if;
 begin
  update public.partner_applications set state='approved';
  raise exception 'Self approval allowed';
 exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000004","aal":"aal1"}',true);
do $$
begin
 if exists(select 1 from public.transport_inquiries) then raise exception 'Admin MFA bypass'; end if;
 begin
  perform public.advance_transport('10000000-0000-0000-0000-000000000001','under_review');
  raise exception 'Admin RPC MFA bypass' using errcode='XX000';
 exception when raise_exception then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000004","aal":"aal2"}',true);
select public.review_partner(id,'approved') from public.partner_applications;
select public.advance_transport('10000000-0000-0000-0000-000000000001','under_review');
select public.advance_transport('10000000-0000-0000-0000-000000000001','awaiting_carrier_offer');
select public.invite_partner('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','SI to DE, one car');
select id as opportunity from public.transport_opportunities \gset

select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000003","aal":"aal1"}',true);
select public.submit_carrier_quote(:'opportunity',60000,'EUR','Fixture VAT',current_date+7);
do $$
begin
 if (select count(*) from public.transport_opportunities)<>1 or (select count(*) from public.transport_quotes)<>1 or
  exists(select 1 from public.transport_inquiries) or exists(select 1 from public.quote_costs) then
  raise exception 'Partner isolation';
 end if;
end $$;

select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000004","aal":"aal2"}',true);
select public.prepare_customer_offer('10000000-0000-0000-0000-000000000001',100000,'EUR','Fixture VAT',current_date+7,60000,5000);
select public.advance_transport('10000000-0000-0000-0000-000000000001','offer_sent');
select id as quote from public.transport_quotes where opportunity_id is null \gset

select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000002","aal":"aal1"}',true);
do $$
begin if exists(select 1 from public.transport_quotes) then raise exception 'Competing quote visible'; end if; end $$;

select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","aal":"aal1"}',true);
select public.accept_customer_offer(:'quote');
do $$
begin
 if (select count(*) from public.transport_orders)<>1 or exists(select 1 from public.quote_costs) then raise exception 'Customer financial isolation'; end if;
end $$;

select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000004","aal":"aal2"}',true);
select public.assign_transport(id,'00000000-0000-0000-0000-000000000003','Synthetic delivery instructions') from public.transport_orders;
select public.advance_transport('10000000-0000-0000-0000-000000000001','scheduled');

select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000003","aal":"aal1"}',true);
do $$
begin
 begin
  perform public.advance_transport('10000000-0000-0000-0000-000000000001','delivered');
  raise exception 'Skipped status allowed' using errcode='XX000';
 exception when raise_exception then null; end;
end $$;
select public.advance_transport('10000000-0000-0000-0000-000000000001','picked_up');
select public.advance_transport('10000000-0000-0000-0000-000000000001','in_transit');
select public.advance_transport('10000000-0000-0000-0000-000000000001','delivered');

select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000004","aal":"aal2"}',true);
select public.advance_transport('10000000-0000-0000-0000-000000000001','completed');
select public.archive_inquiry('10000000-0000-0000-0000-000000000001');
select public.review_partner(id,'suspended') from public.partner_applications;
do $$
begin
 if not exists(select 1 from public.manager_financials()
 where currency='EUR' and revenue_minor=100000 and carrier_minor=60000 and expenses_minor=5000 and profit_minor=35000 and margin_percent=35)
 then raise exception 'Incorrect financials'; end if;
 if (select count(*) from public.transport_status_history where inquiry_id='10000000-0000-0000-0000-000000000001')<>12
 or not exists(select 1 from public.audit_logs where entity='transport_assignments') then raise exception 'Missing audit history'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000003","aal":"aal1"}',true);
do $$
begin
 if exists(select 1 from public.transport_opportunities) or exists(select 1 from public.transport_assignments) then raise exception 'Suspension ineffective'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000005","aal":"aal1"}',true);
do $$
begin
 begin
  perform public.choose_customer_account_type('private_customer');
  raise exception 'Unconfirmed onboarding allowed' using errcode='XX000';
 exception when raise_exception then null; end;
end $$;

select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","aal":"aal1"}',true);
select public.choose_customer_account_type('business_customer');
do $$
begin
 begin
  update public.profiles set onboarding_completed_at=now();
  raise exception 'Direct completion allowed';
 exception when insufficient_privilege then null; end;
 begin
  perform public.choose_customer_account_type('admin');
  raise exception 'Privileged classification allowed' using errcode='XX000';
 exception when raise_exception then null; end;
 begin
  perform public.complete_free_customer_onboarding('Synthetic Buyer');
  raise exception 'Business account without company name allowed' using errcode='XX000';
 exception when raise_exception then null; end;
end $$;
select public.complete_free_customer_onboarding('Synthetic Buyer','Synthetic Business');
select public.complete_free_customer_onboarding('Retry','Ignored');
select public.choose_customer_account_type('private_customer');
do $$
begin
 if not exists(select 1 from public.profiles
  where account_type='business_customer' and business_name='Synthetic Business'
  and display_name='Synthetic Buyer' and onboarding_completed_at is not null)
  or exists(select 1 from public.user_roles) then raise exception 'Incorrect onboarding state'; end if;
end $$;

select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000002","aal":"aal1"}',true);
do $$
begin
 if exists(select 1 from public.profiles where business_name='Synthetic Business') then
  raise exception 'Cross-customer business profile read allowed';
 end if;
end $$;
rollback;
