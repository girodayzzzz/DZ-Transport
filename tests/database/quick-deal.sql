begin;
insert into auth.users values
 ('50000000-0000-0000-0000-000000000001','buyer@example.invalid',now()),
 ('50000000-0000-0000-0000-000000000002','carrier1@example.invalid',now()),
 ('50000000-0000-0000-0000-000000000003','carrier2@example.invalid',now()),
 ('50000000-0000-0000-0000-000000000004','manager@example.invalid',now()),
 ('50000000-0000-0000-0000-000000000005','uninvited@example.invalid',now());
insert into public.user_roles(user_id,role,approved) values
 ('50000000-0000-0000-0000-000000000002','partner',true),
 ('50000000-0000-0000-0000-000000000003','partner',true),
 ('50000000-0000-0000-0000-000000000004','admin',true),
 ('50000000-0000-0000-0000-000000000005','partner',true);
insert into public.transport_inquiries(id,customer_id,contact_email,origin,destination,description,status) values
 ('51000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','buyer@example.invalid',
  'Private pickup','Private delivery','Private cargo notes','awaiting_carrier_offer');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"50000000-0000-0000-0000-000000000004","aal":"aal2"}',true);
select public.draft_quick_deal('51000000-0000-0000-0000-000000000001','Pallets','SI','DE',
 daterange(current_date+2,current_date+3),daterange(current_date+4,current_date+5),'Box van',700,'1.2 × 0.8 × 1 m',
 100000,'EUR','Fixture VAT','','Valid carrier insurance',clock_timestamp()+interval '1 day') as deal \gset
select set_config('dz_test.deal',:'deal',true);
do $$
begin
 begin
  perform public.publish_quick_deal(current_setting('dz_test.deal')::uuid);
  raise exception 'Published with feature disabled' using errcode='XX000';
 exception when raise_exception then null; end;
end $$;

reset role;
update dz_private.quick_deal_settings set enabled=true;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"50000000-0000-0000-0000-000000000004","aal":"aal1"}',true);
do $$
begin
 if exists(select 1 from public.list_quick_deals()) then raise exception 'AAL1 manager read'; end if;
 begin
  perform public.publish_quick_deal(current_setting('dz_test.deal')::uuid);
  raise exception 'AAL1 manager published' using errcode='XX000';
 exception when raise_exception then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"50000000-0000-0000-0000-000000000004","aal":"aal2"}',true);
select public.attest_quick_deal_eligibility(:'deal','50000000-0000-0000-0000-000000000002',now()+interval '1 day');
select public.attest_quick_deal_eligibility(:'deal','50000000-0000-0000-0000-000000000003',now()+interval '1 day');
select public.publish_quick_deal(:'deal');

set local role anon;
do $$
begin
 begin perform public.list_quick_deals(); raise exception 'Anonymous deals allowed';
 exception when insufficient_privilege then null; end;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"50000000-0000-0000-0000-000000000005","aal":"aal1"}',true);
do $$
begin
 if exists(select 1 from public.list_quick_deals()) then raise exception 'Unattested partner read'; end if;
 begin
  perform public.request_quick_deal(current_setting('dz_test.deal')::uuid,100000,'EUR','free');
  raise exception 'Unattested partner requested' using errcode='XX000';
 exception when raise_exception then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"50000000-0000-0000-0000-000000000002","aal":"aal1"}',true);
do $$
begin
 if not exists(select 1 from public.list_quick_deals() where carrier_minor=100000 and status='available')
 or exists(select 1 from public.transport_inquiries)
 or exists(select 1 from public.quick_deal_requests(current_setting('dz_test.deal')::uuid)) then
  raise exception 'Carrier projection invalid';
 end if;
 begin perform id from dz_private.quick_deal_candidates; raise exception 'Direct candidate access';
 exception when insufficient_privilege then null; end;
end $$;
select public.request_quick_deal(:'deal',100000,'EUR','free');
select public.request_quick_deal(:'deal',100000,'EUR','free');
select set_config('request.jwt.claims','{"sub":"50000000-0000-0000-0000-000000000003","aal":"aal1"}',true);
select public.request_quick_deal(:'deal',100000,'EUR','free');
select set_config('request.jwt.claims','{"sub":"50000000-0000-0000-0000-000000000004","aal":"aal2"}',true);
select public.reserve_quick_deal(:'deal','50000000-0000-0000-0000-000000000002');
do $$
begin
 if exists(select from public.carrier_fees) then raise exception 'Reservation created a fee'; end if;
 if (select count(*) from public.notifications where event='quick_deal_requested')<>2 then
  raise exception 'Request retries duplicated notifications';
 end if;
 begin
  perform public.reserve_quick_deal(current_setting('dz_test.deal')::uuid,'50000000-0000-0000-0000-000000000003');
  raise exception 'Conflicting reservation allowed' using errcode='XX000';
 exception when raise_exception then null; end;
end $$;

reset role;
do $$
begin
 if exists(select from public.transport_conversations) then raise exception 'Reservation opened a conversation'; end if;
end $$;
update dz_private.quick_deals set reserved_until=clock_timestamp()-interval '1 second' where id=:'deal';
set local role authenticated;
select public.reserve_quick_deal(:'deal','50000000-0000-0000-0000-000000000003');
select public.prepare_customer_offer('51000000-0000-0000-0000-000000000001',90000,'EUR','Fixture VAT',current_date+7,1,5000);
select public.advance_transport('51000000-0000-0000-0000-000000000001','offer_sent');
select id as quote from public.transport_quotes where inquiry_id='51000000-0000-0000-0000-000000000001' \gset
select set_config('request.jwt.claims','{"sub":"50000000-0000-0000-0000-000000000001","aal":"aal1"}',true);
select public.accept_customer_offer(:'quote');
select id as order_id from public.transport_orders where inquiry_id='51000000-0000-0000-0000-000000000001' \gset
select set_config('dz_test.order',:'order_id',true);
select set_config('request.jwt.claims','{"sub":"50000000-0000-0000-0000-000000000004","aal":"aal2"}',true);
do $$
begin
 begin
  perform public.assign_transport(current_setting('dz_test.order')::uuid,'50000000-0000-0000-0000-000000000002','Fixture');
  raise exception 'Legacy assignment bypass' using errcode='XX000';
 exception when raise_exception then null; end;
 begin
  perform public.assign_quick_deal(current_setting('dz_test.deal')::uuid,current_setting('dz_test.order')::uuid,'Fixture',false);
  raise exception 'Contract confirmation bypass' using errcode='XX000';
 exception when raise_exception then null; end;
end $$;
select public.assign_quick_deal(:'deal',:'order_id','Fixture transport instructions',true);
do $$
begin
 begin
  perform public.assign_quick_deal(current_setting('dz_test.deal')::uuid,current_setting('dz_test.order')::uuid,'Fixture',true);
  raise exception 'Duplicate assignment succeeded' using errcode='XX000';
 exception when raise_exception then null; end;
end $$;
do $$
begin
 if (select count(*) from public.transport_assignments where order_id=current_setting('dz_test.order')::uuid)<>1
 or not exists(select 1 from public.list_quick_deals() where status='assigned')
 or not exists(select 1 from public.quote_costs where carrier_minor=100000)
 or not exists(select 1 from public.audit_logs where entity='quick_deals') then raise exception 'Assignment verification failed'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"50000000-0000-0000-0000-000000000003","aal":"aal1"}',true);
do $$
begin
 if (select count(*) from public.carrier_fees where base_minor=100000 and fee_minor=10000 and plan='free')<>1
 or (select count(*) from public.transport_conversations)<>1 then raise exception 'Quick Deal fee or chat missing'; end if;
 if (select count(*) from public.notifications where event='quick_deal_reserved')<>1
 or not exists(select 1 from public.notifications where event='status_changed')
 or exists(select 1 from public.transport_quotes)
 or exists(select 1 from public.quote_costs) then raise exception 'Assignment notification or financial access failure'; end if;
end $$;
select public.mark_notification_read(id) from public.notifications where event='quick_deal_reserved';
do $$
begin
 if exists(select 1 from public.notifications where event='quick_deal_reserved' and read_at is null) then
  raise exception 'Carrier cannot mark its reservation notification read';
 end if;
end $$;
rollback;
