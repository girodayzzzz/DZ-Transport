update dz_private.payment_settings set enabled=true;
update dz_private.quick_deal_settings set enabled=true;
insert into auth.users values
 ('89000000-0000-0000-0000-000000000001','concurrent-buyer@example.invalid',now()),
 ('89000000-0000-0000-0000-000000000002','concurrent-carrier@example.invalid',now()),
 ('89000000-0000-0000-0000-000000000003','concurrent-other@example.invalid',now()),
 ('89000000-0000-0000-0000-000000000004','concurrent-manager@example.invalid',now());
insert into public.user_roles(user_id,role,approved) values
 ('89000000-0000-0000-0000-000000000002','partner',true),
 ('89000000-0000-0000-0000-000000000003','partner',true),
 ('89000000-0000-0000-0000-000000000004','admin',true);

set role authenticated;
set request.jwt.claims='{"sub":"89000000-0000-0000-0000-000000000001"}';
select public.v8_begin_checkout('quick_deal',null,'89100000-0000-0000-0000-000000000001',
 jsonb_build_object('amount',50000,'origin','SI','destination','DE','description','V8 concurrency fixture',
  'category','pallet','pickup',daterange(current_date+1,current_date+2),'delivery',daterange(current_date+2,current_date+3),
  'vehicle','van','weight',100,'dimensions','one pallet','vat','test','requirements','insurance'));

set request.jwt.claims='{"sub":"89000000-0000-0000-0000-000000000004","aal":"aal2"}';
select public.attest_quick_deal_eligibility(deal_id,'89000000-0000-0000-0000-000000000002',now()+interval '2 days')
 from public.transport_payments where id='89100000-0000-0000-0000-000000000001';
select public.attest_quick_deal_eligibility(deal_id,'89000000-0000-0000-0000-000000000003',now()+interval '2 days')
 from public.transport_payments where id='89100000-0000-0000-0000-000000000001';
set role service_role;
select public.v8_payment_event('evt_concurrent_paid','89100000-0000-0000-0000-000000000001','paid',
 '{"session":"cs_concurrent","amount":50000,"currency":"eur","intent":"pi_concurrent","charge":"ch_concurrent"}');
reset role;
reset request.jwt.claims;
