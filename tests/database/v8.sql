begin;
update dz_private.payment_settings set enabled=true;
update dz_private.quick_deal_settings set enabled=true;
insert into auth.users values
 ('88000000-0000-0000-0000-000000000001','buyer@example.invalid',now()),
 ('88000000-0000-0000-0000-000000000002','carrier@example.invalid',now()),
 ('88000000-0000-0000-0000-000000000003','other@example.invalid',now()),
 ('88000000-0000-0000-0000-000000000004','manager@example.invalid',now());
insert into public.user_roles(user_id,role,approved) values
 ('88000000-0000-0000-0000-000000000002','partner',true),
 ('88000000-0000-0000-0000-000000000003','partner',true),
 ('88000000-0000-0000-0000-000000000004','admin',true);

create function pg_temp.assert_true(value boolean, description text) returns void language plpgsql as $$
begin
 if value is distinct from true then raise exception 'Assertion failed: %',description; end if;
end $$;

set local role authenticated;
set local request.jwt.claims='{"sub":"88000000-0000-0000-0000-000000000001","email":"buyer@example.invalid"}';
select public.v8_begin_checkout('quick_deal',null,'88100000-0000-0000-0000-000000000001',
 jsonb_build_object('amount',50000,'origin','SI','destination','DE','description','V8 fixture',
  'category','pallet','pickup',daterange(current_date+1,current_date+2),'delivery',daterange(current_date+2,current_date+3),
  'vehicle','van','weight',100,'dimensions','one pallet','vat','test','requirements','insurance'));
select public.v8_begin_checkout('quick_deal',null,'88100000-0000-0000-0000-000000000002',
 jsonb_build_object('amount',50000,'origin','SI','destination','DE','description','Expiry fixture',
  'category','pallet','pickup',daterange(current_date+1,current_date+2),'delivery',daterange(current_date+2,current_date+3),
  'vehicle','van','weight',100,'dimensions','one pallet','vat','test','requirements','insurance'));
select pg_temp.assert_true((select count(*)=2 from public.transport_payments where state='checkout_pending'),
 'Both Quick Deals wait for payment');
reset role;

select set_config('dz.test.deal',(select deal_id::text from public.transport_payments where id='88100000-0000-0000-0000-000000000001'),true);
select set_config('dz.test.inquiry',(select inquiry_id::text from public.transport_payments where id='88100000-0000-0000-0000-000000000001'),true);
set local role authenticated;
set local request.jwt.claims='{"sub":"88000000-0000-0000-0000-000000000004","aal":"aal2"}';
select public.attest_quick_deal_eligibility(current_setting('dz.test.deal')::uuid,'88000000-0000-0000-0000-000000000002',now()+interval '2 days');
select public.attest_quick_deal_eligibility(current_setting('dz.test.deal')::uuid,'88000000-0000-0000-0000-000000000003',now()+interval '2 days');
set local request.jwt.claims='{"sub":"88000000-0000-0000-0000-000000000002"}';
select pg_temp.assert_true(not exists(select 1 from public.list_quick_deals()),'Unpaid Quick Deal is hidden');
select pg_temp.assert_true(not exists(select 1 from public.transport_payments),'Unassigned payments are private');
do $$
begin
 begin
  perform public.v8_accept_quick_deal(current_setting('dz.test.deal')::uuid,50000,'free');
  raise exception 'Unpaid deal accepted' using errcode='XX000';
 exception when raise_exception then null; end;
 begin
  perform public.v8_tick();
  raise exception 'Carrier worker access' using errcode='XX000';
 exception when insufficient_privilege then null; end;
end $$;

set local role service_role;
select public.v8_payment_event('evt_qd_paid','88100000-0000-0000-0000-000000000001','paid',
 '{"session":"cs_quick","amount":50000,"currency":"eur","intent":"pi_quick","charge":"ch_quick"}');
select public.v8_payment_event('evt_qd_paid','88100000-0000-0000-0000-000000000001','paid',
 '{"session":"cs_quick","amount":50000,"currency":"eur","intent":"pi_quick","charge":"ch_quick"}');
select public.v8_payment_event('evt_qd_stale_expired','88100000-0000-0000-0000-000000000001','expired',
 '{"session":"cs_quick","amount":50000,"currency":"eur"}');
select public.v8_payment_event('evt_2_paid','88100000-0000-0000-0000-000000000002','paid',
 '{"session":"cs_exp","amount":50000,"currency":"eur","intent":"pi_exp","charge":"ch_exp"}');
reset role;
update public.transport_payments set expires_at=now()-interval '1 minute'
 where id='88100000-0000-0000-0000-000000000002';
set local role service_role;
select public.v8_tick();
select public.v8_payment_event('evt_2_refunded','88100000-0000-0000-0000-000000000002','refund',
 '{"charge":"ch_exp","refunded":50000}');
reset role;
select pg_temp.assert_true((select state='refunded' from public.transport_payments where id='88100000-0000-0000-0000-000000000002'),
 'Expired paid Quick Deal receives a full refund');

set local role authenticated;
set local request.jwt.claims='{"sub":"88000000-0000-0000-0000-000000000004","aal":"aal2"}';
select set_config('dz.test.listing',public.publish_load(current_setting('dz.test.inquiry')::uuid,'pallet','SI','DE',true,true)::text,true);
set local role anon;
select pg_temp.assert_true(exists(select 1 from public.public_load(current_setting('dz.test.listing')::uuid)),
 'Paid Quick Deal can have a moderated public listing');

set local role authenticated;
set local request.jwt.claims='{"sub":"88000000-0000-0000-0000-000000000002"}';
select public.v8_accept_quick_deal(current_setting('dz.test.deal')::uuid,50000,'free');
select pg_temp.assert_true((select commission_minor=5000 from public.transport_payments where id='88100000-0000-0000-0000-000000000001'),
 'Test fixture €500 gross, €50 commission, €450 carrier amount');
select public.advance_transport(current_setting('dz.test.inquiry')::uuid,'picked_up');
select public.advance_transport(current_setting('dz.test.inquiry')::uuid,'in_transit');
select public.advance_transport(current_setting('dz.test.inquiry')::uuid,'delivered');
select public.v8_transport_invoice('88100000-0000-0000-0000-000000000001',encode(convert_to('%PDF-fixture','UTF8'),'base64'));
set local request.jwt.claims='{"sub":"88000000-0000-0000-0000-000000000003"}';
select pg_temp.assert_true(not exists(select 1 from public.transport_payments),'Unassigned carrier cannot see financial details');
do $$
begin
 begin
  perform public.v8_accept_quick_deal(current_setting('dz.test.deal')::uuid,50000,'free');
  raise exception 'Duplicate success' using errcode='XX000';
 exception when raise_exception then null; end;
 begin
  perform public.v8_transport_invoice('88100000-0000-0000-0000-000000000001',null);
  raise exception 'Invoice access leaked' using errcode='XX000';
 exception when raise_exception then null; end;
end $$;
set local request.jwt.claims='{"sub":"88000000-0000-0000-0000-000000000001","email":"buyer@example.invalid"}';
select pg_temp.assert_true(public.v8_transport_invoice('88100000-0000-0000-0000-000000000001',null) is not null,'Buyer can read invoice');
select public.v8_payment_action('88100000-0000-0000-0000-000000000001','dispute','Fixture damage report');
do $$
begin
 begin
  perform public.v8_payment_action('88100000-0000-0000-0000-000000000001','confirm');
  raise exception 'Open dispute ignored' using errcode='XX000';
 exception when raise_exception then null; end;
end $$;

set local request.jwt.claims='{"sub":"88000000-0000-0000-0000-000000000004","aal":"aal2"}';
select public.v8_payment_action('88100000-0000-0000-0000-000000000001','confirm','Fixture dispute resolved');
reset role;
insert into dz_private.carrier_connect(partner_id,account_id) values('88000000-0000-0000-0000-000000000002','acct_fixture');
-- The claim for these synthetic payment events is completed directly with a simulated Stripe result.
update dz_private.payment_operations set status='done' where kind='checkout';
update dz_private.payment_operations set status='done' where kind='refund';
set local role service_role;
select pg_temp.assert_true((public.v8_claim_operation('transfer:88100000-0000-0000-0000-000000000001')
 #>>'{operation,payload,amount}')::int=45000,'Transfer releases the net amount');
select public.v8_transfer_event('evt_transfer','88100000-0000-0000-0000-000000000001',
 '{"id":"tr_fixture","amount":45000,"destination":"acct_fixture","source_transaction":"ch_quick","currency":"eur"}');
select public.v8_connect_event('acct_fixture','evt_payout_failed',
 '{"id":"po_fixture","amount":45000,"currency":"eur","created":1750000000,"status":"failed","failure_message":"Account closed"}');
set local role authenticated;
set local request.jwt.claims='{"sub":"88000000-0000-0000-0000-000000000004","aal":"aal2"}';
select pg_temp.assert_true((select state='failed' from public.v8_admin_payouts() where amount_minor=45000),
 'Failed payout visible to management');
select public.v8_payment_action('88100000-0000-0000-0000-000000000001','refund','Fixture partial compensation',10000);
set local role service_role;
select public.v8_payment_event('evt_partial','88100000-0000-0000-0000-000000000001','refund',
 '{"charge":"ch_quick","refunded":10000}');
reset role;
select pg_temp.assert_true((select state='partially_refunded' and commission_minor=4000 and settled_at is not null
 from public.transport_payments where id='88100000-0000-0000-0000-000000000001'),'Partial refund recomputes net and commission');
select pg_temp.assert_true((select (payload->>'amount')::int=9000 from dz_private.payment_operations
 where operation_key='reversal:88100000-0000-0000-0000-000000000001:10000'),'Partial refund queues corresponding reversal');

insert into public.transport_inquiries(id,customer_id,contact_email,origin,destination,description,status)
 values('88200000-0000-0000-0000-000000000001','88000000-0000-0000-0000-000000000001',
 'buyer@example.invalid','SI','DE','V8 quote fixture','awaiting_carrier_offer');
insert into public.transport_opportunities(id,inquiry_id,partner_id,summary)
 values('88300000-0000-0000-0000-000000000001','88200000-0000-0000-0000-000000000001','88000000-0000-0000-0000-000000000002','synthetic');
insert into public.transport_quotes(id,inquiry_id,opportunity_id,amount_minor,currency,vat_treatment,valid_until,status)
 values('88400000-0000-0000-0000-000000000001','88200000-0000-0000-0000-000000000001','88300000-0000-0000-0000-000000000001',
  50000,'EUR','test',current_date+1,'sent');
select pg_temp.assert_true(not exists(select 1 from public.transport_payments where inquiry_id='88200000-0000-0000-0000-000000000001'),
 'Quote submission is unpaid');
set local role authenticated;
set local request.jwt.claims='{"sub":"88000000-0000-0000-0000-000000000001","email":"buyer@example.invalid"}';
select public.v8_begin_checkout('quote','88400000-0000-0000-0000-000000000001','88100000-0000-0000-0000-000000000003');
select pg_temp.assert_true(public.v8_begin_checkout('quote','88400000-0000-0000-0000-000000000001','88100000-0000-0000-0000-000000000004')
 ='88100000-0000-0000-0000-000000000003','Quote retry reuses reservation');
set local role service_role;
select public.v8_payment_event('evt_quote_expired','88100000-0000-0000-0000-000000000003','expired',
 '{"session":"cs_quote_old","amount":50000,"currency":"eur"}');
set local role authenticated;
select public.v8_begin_checkout('quote','88400000-0000-0000-0000-000000000001','88100000-0000-0000-0000-000000000005');
set local role service_role;
select public.v8_payment_event('evt_quote_paid_after_expiry','88100000-0000-0000-0000-000000000003','paid',
 '{"session":"cs_quote_old","amount":50000,"currency":"eur","intent":"pi_late","charge":"ch_late"}');
select public.v8_payment_event('evt_quote_paid','88100000-0000-0000-0000-000000000005','paid',
 '{"session":"cs_quote","amount":50000,"currency":"eur","intent":"pi_quote","charge":"ch_quote"}');
reset role;
select pg_temp.assert_true((select count(*)=1 from public.transport_orders where inquiry_id='88200000-0000-0000-0000-000000000001'),
 'Only the paid active Quote produces an order');
select pg_temp.assert_true((select superseded and state='refund_pending' from public.transport_payments
 where id='88100000-0000-0000-0000-000000000003'),'Late payment for old reservation enters refund without conflicting with new reservation');
rollback;
