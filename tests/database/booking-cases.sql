begin;
insert into auth.users values
 ('12000000-0000-0000-0000-000000000001','customer@example.invalid',now()),
 ('12000000-0000-0000-0000-000000000002','carrier@example.invalid',now()),
 ('12000000-0000-0000-0000-000000000003','admin@example.invalid',now()),
 ('12000000-0000-0000-0000-000000000004','unrelated@example.invalid',now());
insert into public.user_roles(user_id,role,approved) values
 ('12000000-0000-0000-0000-000000000002','partner',true),
 ('12000000-0000-0000-0000-000000000003','admin',true);
insert into public.companies(owner_id,name,coverage,services)
 values('12000000-0000-0000-0000-000000000002','Synthetic Carrier','SI','Vehicle transport');
insert into public.transport_inquiries(id,customer_id,contact_email,origin,destination,description,status)
select ('12100000-0000-0000-0000-00000000000'||index)::uuid,'12000000-0000-0000-0000-000000000001','customer@example.invalid',
 'Murska Sobota','Maribor','Synthetic fixture','awaiting_carrier_offer'
from generate_series(1,8) index;
insert into public.transport_opportunities(id,inquiry_id,partner_id,summary)
select ('12200000-0000-0000-0000-00000000000'||right(id::text,1))::uuid,id,'12000000-0000-0000-0000-000000000002','Synthetic fixture'
from public.transport_inquiries where contact_email='customer@example.invalid';

set local role authenticated;
set local request.jwt.claims='{"sub":"12000000-0000-0000-0000-000000000002","aal":"aal1"}';
select public.submit_booking_offer(id,50000,'EUR','VAT included',current_date+2,'free','Monday 10:00','Vehicle rolls and steers')
 from public.transport_opportunities where partner_id=auth.uid();
select public.withdraw_booking_offer(id) from public.transport_quotes where opportunity_id='12200000-0000-0000-0000-000000000008';
reset role;
update public.transport_quotes set valid_until=current_date-1 where opportunity_id='12200000-0000-0000-0000-000000000007';

set local role authenticated;
set local request.jwt.claims='{"sub":"12000000-0000-0000-0000-000000000003","aal":"aal2"}';
reset role;
insert into dz_private.carrier_billing(carrier_id,stripe_account,subscription_plan,paid_until)
 values('12000000-0000-0000-0000-000000000002','acct_fixture','pro',now()+interval '1 month');
set local role authenticated;
select public.prepare_booking_offer(id) from public.transport_quotes where opportunity_id is not null
 and status='sent' and valid_until>=current_date and inquiry_id::text like '12100000%' and right(inquiry_id::text,1)<='5';
select public.advance_transport(id,'offer_sent') from public.transport_inquiries where id::text like '12100000%' and status='offer_prepared';
do $$
declare bid uuid;
begin
 for bid in select id from public.transport_quotes where opportunity_id is not null and right(inquiry_id::text,1) in ('7','8') and inquiry_id::text like '12100000%' loop
  begin
   perform public.prepare_booking_offer(bid);
   raise exception 'Expired or withdrawn offer could be prepared' using errcode='XX000';
  exception when raise_exception or no_data_found then null; end;
 end loop;
end $$;

set local request.jwt.claims='{"sub":"12000000-0000-0000-0000-000000000001","aal":"aal1"}';
do $$
declare q uuid;
begin
 for q in select id from public.transport_quotes where opportunity_id is null and inquiry_id::text like '12100000%' loop
  if public.booking_offer_details(q)->>'carrier' is distinct from 'Synthetic Carrier' then raise exception 'Missing seller'; end if;
  perform public.accept_customer_offer(q);
  perform public.accept_customer_offer(q);
 end loop;
 if (select count(*) from public.transport_conversations)<>5 then raise exception 'Duplicate or missing assignment/chat'; end if;
end $$;
select set_config('booking.order1',(select id::text from public.transport_orders where inquiry_id='12100000-0000-0000-0000-000000000001'),true);
select set_config('booking.case1',public.request_booking_cancellation(current_setting('booking.order1')::uuid,'changed_terms','Customer changed availability')::text,true);
do $$
begin
 if public.request_booking_cancellation(current_setting('booking.order1')::uuid,'changed_terms','Customer changed availability')::text<>current_setting('booking.case1')
 then raise exception 'Cancellation request not idempotent'; end if;
 if (select status from public.transport_inquiries where id='12100000-0000-0000-0000-000000000001')<>'carrier_assigned'
 then raise exception 'Cancellation closed before decision'; end if;
end $$;
set local request.jwt.claims='{"sub":"12000000-0000-0000-0000-000000000004","aal":"aal1"}';
do $$
begin
 if exists(select 1 from public.booking_order_cases()) then raise exception 'Case leaked to a third party'; end if;
 begin
  perform public.update_booking_cancellation(current_setting('booking.case1')::uuid,'object','Unrelated');
  raise exception 'Third-party case write' using errcode='XX000';
 exception when raise_exception then null; end;
end $$;
set local request.jwt.claims='{"sub":"12000000-0000-0000-0000-000000000003","aal":"aal1"}';
do $$
begin
 if exists(select 1 from public.booking_order_cases()) then raise exception 'Admin case data visible without MFA'; end if;
 begin
  perform public.update_booking_cancellation(current_setting('booking.case1')::uuid,'approve','Test','customer');
  raise exception 'Admin action without MFA' using errcode='XX000';
 exception when raise_exception then null; end;
end $$;
set local request.jwt.claims='{"sub":"12000000-0000-0000-0000-000000000002","aal":"aal1"}';
do $$
begin
 if (select count(*) from public.carrier_fees where base_minor=50000 and fee_minor=2500 and rate=5 and plan='pro')<>5
 then raise exception 'Commission did not use the plan at final acceptance'; end if;
 if not exists(select 1 from public.notifications where event='booking_cancellation') then raise exception 'Missing cancellation notice'; end if;
end $$;
select public.update_booking_cancellation(current_setting('booking.case1')::uuid,'object','The booking time was agreed');
select set_config('booking.case2',public.request_booking_cancellation(id,'unable','Carrier cancellation')::text,true)
 from public.transport_orders where inquiry_id='12100000-0000-0000-0000-000000000002';
select set_config('booking.case3',public.request_booking_cancellation(id,'unable','Exceptional cancellation')::text,true)
 from public.transport_orders where inquiry_id='12100000-0000-0000-0000-000000000003';
select set_config('booking.case4',public.request_booking_cancellation(id,'mutual','Both parties agreed')::text,true)
 from public.transport_orders where inquiry_id='12100000-0000-0000-0000-000000000004';
select set_config('booking.case5',public.request_booking_cancellation(id,'other','Older order')::text,true)
 from public.transport_orders where inquiry_id='12100000-0000-0000-0000-000000000005';

set local request.jwt.claims='{"sub":"12000000-0000-0000-0000-000000000003","aal":"aal2"}';
select public.update_booking_cancellation(current_setting('booking.case1')::uuid,'internal_note','Private marker');
select public.update_booking_cancellation(current_setting('booking.case1')::uuid,'request_info','Supply dates');
set local request.jwt.claims='{"sub":"12000000-0000-0000-0000-000000000001","aal":"aal1"}';
do $$
begin
 if exists(select 1 from public.booking_order_cases() a where a::text like '%Private marker%') then raise exception 'Internal note leaked'; end if;
end $$;
select public.update_booking_cancellation(current_setting('booking.case1')::uuid,'supply','Synthetic dates');
select public.update_booking_cancellation(current_setting('booking.case4')::uuid,'agree','Confirmed');
set local request.jwt.claims='{"sub":"12000000-0000-0000-0000-000000000003","aal":"aal2"}';
select public.update_booking_cancellation(current_setting('booking.case1')::uuid,'approve','Customer caused the cancellation','customer');
select public.update_booking_cancellation(current_setting('booking.case2')::uuid,'approve','Carrier caused the cancellation','carrier');
select public.update_booking_cancellation(current_setting('booking.case3')::uuid,'approve','Carrier could not perform','carrier');
select public.update_booking_cancellation(current_setting('booking.case4')::uuid,'approve','Both parties agreed','mutual');
select public.update_booking_cancellation(current_setting('booking.case5')::uuid,'approve','Customer caused the cancellation','customer');
reset role;
update public.carrier_fees set created_at=now()-interval '30 days' where order_id in
 (select id from public.transport_orders where inquiry_id='12100000-0000-0000-0000-000000000005');

set local role authenticated;
set local request.jwt.claims='{"sub":"12000000-0000-0000-0000-000000000002","aal":"aal1"}';
select set_config('booking.claim1',public.request_booking_commission(current_setting('booking.case1')::uuid,'First claim')::text,true);
select set_config('booking.claim2',public.request_booking_commission(current_setting('booking.case2')::uuid,'Second claim')::text,true);
select set_config('booking.claim3',public.request_booking_commission(current_setting('booking.case3')::uuid,'Exceptional claim')::text,true);
select set_config('booking.claim4',public.request_booking_commission(current_setting('booking.case4')::uuid,'Mutual claim')::text,true);
do $$
begin
 if public.request_booking_commission(current_setting('booking.case1')::uuid,'Duplicate')::text<>current_setting('booking.claim1')
 then raise exception 'Commission claim not idempotent'; end if;
 begin
  perform public.request_booking_commission(current_setting('booking.case5')::uuid,'Expired claim');
  raise exception 'Commission request accepted after 30 days' using errcode='XX000';
 exception when raise_exception then null; end;
end $$;

set local request.jwt.claims='{"sub":"12000000-0000-0000-0000-000000000003","aal":"aal2"}';
do $$
begin
 begin
  perform public.decide_booking_commission(current_setting('booking.claim1')::uuid,false,false,'Invalid decision');
  raise exception 'Customer-caused cancellation refused' using errcode='XX000';
 exception when raise_exception then null; end;
 begin
  perform public.decide_booking_commission(current_setting('booking.claim3')::uuid,true,false,'Missing exception');
  raise exception 'Carrier-caused cancellation approved without exception' using errcode='XX000';
 exception when raise_exception then null; end;
end $$;
select public.decide_booking_commission(current_setting('booking.claim1')::uuid,true,false,'Customer caused cancellation');
select public.decide_booking_commission(current_setting('booking.claim2')::uuid,false,false,'Carrier caused cancellation');
select public.decide_booking_commission(current_setting('booking.claim3')::uuid,true,true,'Applicable circumstances outside carrier control');
select public.decide_booking_commission(current_setting('booking.claim4')::uuid,true,false,'Both parties agreed');
do $$
begin
 if (select count(*) from public.carrier_fees where voided_at is not null and fee_minor=2500)<>3
  or (select count(*) from public.carrier_fees where voided_at is null and fee_minor=2500)<>2
 then raise exception 'Original fee or correction lost'; end if;
end $$;

-- Signed Checkout event is the final transition. Use the test ledger only.
reset role;
update dz_private.payment_settings set enabled=true;
set local role authenticated;
set local request.jwt.claims='{"sub":"12000000-0000-0000-0000-000000000001","aal":"aal1"}';
select set_config('booking.payment',public.v8_begin_checkout('quote',id,'12300000-0000-0000-0000-000000000001')::text,true)
 from public.v8_customer_bids() where amount_minor=50000;
do $$
begin
 if (select count(*) from public.transport_orders)<>5 then raise exception 'Checkout reservation assigned a carrier'; end if;
end $$;
reset role;
select public.v8_payment_event('booking_paid',current_setting('booking.payment')::uuid,'paid',
 '{"session":"cs_test_booking","amount":50000,"currency":"eur","charge":"ch_booking","intent":"pi_booking"}');
select public.v8_payment_event('booking_paid',current_setting('booking.payment')::uuid,'paid',
 '{"session":"cs_test_booking","amount":50000,"currency":"eur","charge":"ch_booking","intent":"pi_booking"}');
insert into dz_private.carrier_connect(partner_id,account_id) values('12000000-0000-0000-0000-000000000002','acct_booking');
set local role authenticated;
set local request.jwt.claims='{"sub":"12000000-0000-0000-0000-000000000002","aal":"aal1"}';
select public.advance_transport('12100000-0000-0000-0000-000000000006','picked_up');
select public.advance_transport('12100000-0000-0000-0000-000000000006','in_transit');
select public.advance_transport('12100000-0000-0000-0000-000000000006','delivered');
set local request.jwt.claims='{"sub":"12000000-0000-0000-0000-000000000001","aal":"aal1"}';
select public.v8_payment_action(current_setting('booking.payment')::uuid,'confirm');
select set_config('booking.blocking_case',public.request_booking_cancellation(id,'other','Pause release')::text,true)
 from public.transport_orders where inquiry_id='12100000-0000-0000-0000-000000000006';
reset role;
do $$
begin
 if public.v8_claim_operation('transfer:'||current_setting('booking.payment')) is not null
  then raise exception 'Queued transfer started during cancellation'; end if;
end $$;
set local role authenticated;
set local request.jwt.claims='{"sub":"12000000-0000-0000-0000-000000000003","aal":"aal2"}';
select public.update_booking_cancellation(current_setting('booking.blocking_case')::uuid,'reject','Review resolved');
reset role;
select set_config('booking.transfer',(public.v8_claim_operation('transfer:'||current_setting('booking.payment'))->'operation'->>'id'),true);
do $$
begin
 if (select (payload->>'amount')::integer from dz_private.payment_operations where id=current_setting('booking.transfer')::uuid) is distinct from 47500
 then raise exception 'Transfer amount does not deduct the original fee once'; end if;
end $$;
select public.v8_finish_operation(current_setting('booking.transfer')::uuid,'{"id":"tr_booking","amount":47500}');
select public.v8_finish_operation(current_setting('booking.transfer')::uuid,'{"id":"tr_booking","amount":47500}');

set local role authenticated;
set local request.jwt.claims='{"sub":"12000000-0000-0000-0000-000000000001","aal":"aal1"}';
select set_config('booking.case6',public.request_booking_cancellation(id,'other','Dispute after transfer')::text,true)
 from public.transport_orders where inquiry_id='12100000-0000-0000-0000-000000000006';
do $$
begin
 if not exists(select 1 from public.booking_order_cases() a where (a->>'transfer_review')::boolean and a->'cases'->0->>'state'='cancellation_review')
 then raise exception 'Existing transfer not routed to review'; end if;
end $$;

set local request.jwt.claims='{"sub":"12000000-0000-0000-0000-000000000003","aal":"aal2"}';
select public.update_booking_cancellation(current_setting('booking.case6')::uuid,'approve','Resolved after delivery','customer');
set local request.jwt.claims='{"sub":"12000000-0000-0000-0000-000000000002","aal":"aal1"}';
select set_config('booking.claim6',public.request_booking_commission(current_setting('booking.case6')::uuid,'Settled commission claim')::text,true);
set local request.jwt.claims='{"sub":"12000000-0000-0000-0000-000000000003","aal":"aal2"}';
select public.decide_booking_commission(current_setting('booking.claim6')::uuid,true,false,'Separate credit-note review');
reset role;
do $$
begin
 if not exists(select 1 from dz_private.booking_commission_claims where id=current_setting('booking.claim6')::uuid and adjustment='credit_or_refund_review')
  or exists(select 1 from dz_private.payment_operations where payment_id=current_setting('booking.payment')::uuid and kind in ('refund','reversal'))
 then raise exception 'Credit review missing or customer refund triggered'; end if;
end $$;
select public.v8_payment_event('booking_refund',current_setting('booking.payment')::uuid,'refund','{"charge":"ch_booking","refunded":50000}');
do $$
begin
 if not exists(select 1 from public.transport_payments where id=current_setting('booking.payment')::uuid and
  refunded_minor=50000 and commission_minor=2500 and settled_at is not null)
  or not exists(select 1 from dz_private.payment_operations where operation_key='reversal:'||current_setting('booking.payment')||':50000'
    and (payload->>'amount')::integer=47500)
 then raise exception 'Customer refund overwrote carrier commission or reversal exceeds transferred amount'; end if;
end $$;
-- Reviewed cleanup can remove an unbooked inquiry without touching an agreement or case.
update public.transport_inquiries set archived_at=now()-interval '100 days'
 where id='12100000-0000-0000-0000-000000000001';
update public.transport_inquiries set archived_at=now()-interval '100 days',status='cancelled'
 where id='12100000-0000-0000-0000-000000000008';
do $$
declare removed bigint;
begin
 removed:=dz_private.purge_archived_inquiries(now()-interval '90 days');
 if removed<>1
  or not exists(select 1 from public.transport_orders where inquiry_id='12100000-0000-0000-0000-000000000001')
  or exists(select 1 from public.transport_inquiries where id='12100000-0000-0000-0000-000000000008')
 then raise exception 'Cleanup removed a booking or retained an expired draft'; end if;
end $$;
rollback;
