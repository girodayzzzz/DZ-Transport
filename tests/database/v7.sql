begin;
insert into auth.users values
 ('77000000-0000-0000-0000-000000000001','buyer@example.invalid',now()),
 ('77000000-0000-0000-0000-000000000002','carrier@example.invalid',now()),
 ('77000000-0000-0000-0000-000000000003','second@example.invalid',now()),
 ('77000000-0000-0000-0000-000000000004','manager@example.invalid',now()),
 ('77000000-0000-0000-0000-000000000005','third@example.invalid',now());
insert into public.user_roles(user_id,role,approved) values
 ('77000000-0000-0000-0000-000000000002','partner',true),
 ('77000000-0000-0000-0000-000000000003','partner',true),
 ('77000000-0000-0000-0000-000000000004','admin',true);
insert into public.transport_inquiries(id,customer_id,contact_email,origin,destination,description,status)
select id,'77000000-0000-0000-0000-000000000001','buyer@example.invalid',
 'Private pickup','Private delivery','Private cargo notes','awaiting_carrier_offer'
from (values ('77100000-0000-0000-0000-000000000001'::uuid),('77100000-0000-0000-0000-000000000002'::uuid)) as fixture(id);
select set_config('dz_test.inquiry','77100000-0000-0000-0000-000000000001',true);

set local role authenticated;
set local request.jwt.claims='{"sub":"77000000-0000-0000-0000-000000000004","aal":"aal2"}';
select public.publish_load(current_setting('dz_test.inquiry')::uuid,'pallet','SI','DE',true,true) as load \gset
select set_config('dz_test.load',:'load',true);
select public.invite_partner(current_setting('dz_test.inquiry')::uuid,'77000000-0000-0000-0000-000000000002','Pallet fixture');
select id as opportunity from public.transport_opportunities where inquiry_id=current_setting('dz_test.inquiry')::uuid \gset
select public.invite_partner('77100000-0000-0000-0000-000000000002','77000000-0000-0000-0000-000000000003','Private fixture');

set local request.jwt.claims='{"sub":"77000000-0000-0000-0000-000000000003","aal":"aal1"}';
select public.ask_load_question('77100000-0000-0000-0000-000000000002',false,'Private synthetic question');
set local request.jwt.claims='{"sub":"77000000-0000-0000-0000-000000000002","aal":"aal1"}';
select public.ask_load_question(:'load',true,'Is a tail lift required?');
select public.submit_carrier_quote(:'opportunity',100000,'EUR','Fixture VAT',current_date+10,'free');
do $$
begin
 if exists(select 1 from public.list_load_questions('77100000-0000-0000-0000-000000000002'))
  or exists(select 1 from public.carrier_fees) or exists(select 1 from public.transport_conversations)
 then raise exception 'Private question or premature confirmation'; end if;
end $$;

set local request.jwt.claims='{"sub":"77000000-0000-0000-0000-000000000001","aal":"aal1"}';
select id as question from public.list_load_questions(current_setting('dz_test.inquiry')::uuid) \gset
select public.answer_load_question(:'question','A tail lift is required.');
set local request.jwt.claims='{"sub":"77000000-0000-0000-0000-000000000004","aal":"aal2"}';
select public.moderate_load_question(:'question','publishQuestion');

set local role anon;
set local request.jwt.claims='{"role":"anon"}';
do $$
begin
 if not exists(select 1 from public.public_load(current_setting('dz_test.load')::uuid) where test_data and not can_ask)
 or not exists(select 1 from public.public_load_questions(current_setting('dz_test.load')::uuid)
    where question='Is a tail lift required?' and answer is null)
 or exists(select 1 from public.public_load('77100000-0000-0000-0000-000000000002'))
 then raise exception 'Anonymous projection incorrect'; end if;
 begin perform public.ask_load_question(current_setting('dz_test.load')::uuid,true,'Anonymous');
  raise exception 'Anonymous could submit';
 exception when insufficient_privilege then null; end;
 begin perform public.list_load_questions('77100000-0000-0000-0000-000000000002');
  raise exception 'Anonymous could access private questions';
 exception when insufficient_privilege then null; end;
end $$;

set local role authenticated;
set local request.jwt.claims='{"sub":"77000000-0000-0000-0000-000000000004","aal":"aal2"}';
select public.moderate_load_question(:'question','publishAnswer');
do $$
begin
 if not exists(select 1 from public.public_load_questions(current_setting('dz_test.load')::uuid)
 where answer='A tail lift is required.') then raise exception 'Approved answer unavailable'; end if;
end $$;
select public.moderate_load_question(:'question','hideQuestion');
do $$
begin
 if exists(select 1 from public.public_load_questions(current_setting('dz_test.load')::uuid)) then
  raise exception 'Hidden question exposed'; end if;
end $$;
reset role;
insert into dz_private.carrier_billing(carrier_id,stripe_account,subscription_plan,paid_until)
 values('77000000-0000-0000-0000-000000000002','acct_fixture','basic',now()+interval '1 month');
set local role authenticated;
select public.prepare_customer_offer(current_setting('dz_test.inquiry')::uuid,125000,'EUR','Fixture VAT',current_date+7,100000,5000);
select public.advance_transport(current_setting('dz_test.inquiry')::uuid,'offer_sent');
select id as quote from public.transport_quotes where inquiry_id=current_setting('dz_test.inquiry')::uuid and opportunity_id is null \gset

set local request.jwt.claims='{"sub":"77000000-0000-0000-0000-000000000001","aal":"aal1"}';
select public.accept_customer_offer(:'quote');
select id as order_id from public.transport_orders where inquiry_id=current_setting('dz_test.inquiry')::uuid \gset
select set_config('dz_test.order',:'order_id',true);
do $$
begin
 if exists(select 1 from public.transport_conversations) then raise exception 'Chat opened before assignment'; end if;
end $$;

set local request.jwt.claims='{"sub":"77000000-0000-0000-0000-000000000004","aal":"aal2"}';
do $$
begin
 begin
  perform public.assign_transport(current_setting('dz_test.order')::uuid,'77000000-0000-0000-0000-000000000002','Fixture');
  raise exception 'Stale terms accepted' using errcode='XX000';
 exception when raise_exception then null; end;
end $$;
select public.propose_carrier_fee_terms(:'order_id','77000000-0000-0000-0000-000000000002');

set local request.jwt.claims='{"sub":"77000000-0000-0000-0000-000000000002","aal":"aal1"}';
select public.confirm_carrier_fee_terms(id,100000,'EUR','basic') from public.carrier_fee_terms;

set local request.jwt.claims='{"sub":"77000000-0000-0000-0000-000000000004","aal":"aal2"}';
select public.assign_transport(:'order_id','77000000-0000-0000-0000-000000000002','Fixture instructions');
reset role;
update dz_private.carrier_billing set paid_until=now()-interval '1 minute'
 where carrier_id='77000000-0000-0000-0000-000000000002';
insert into dz_private.carrier_billing(carrier_id,stripe_account,subscription_plan,paid_until)
 values('77000000-0000-0000-0000-000000000003','acct_fixture','pro',now()+interval '1 month');
set local role authenticated;
select public.propose_carrier_fee_terms(:'order_id','77000000-0000-0000-0000-000000000003');
do $$
begin
 if (select count(*) from public.carrier_fees where base_minor=100000 and fee_minor=7000 and rate=7 and plan='basic')<>1
 then raise exception 'Basic fee snapshot incorrect'; end if;
end $$;

set local request.jwt.claims='{"sub":"77000000-0000-0000-0000-000000000001","aal":"aal1"}';
select id as chat from public.transport_conversations where order_id=:'order_id' \gset
select set_config('dz_test.chat',:'chat',true);
select public.send_transport_message(:'chat','77200000-0000-0000-0000-000000000001','Synthetic private message');
select public.send_transport_message(:'chat','77200000-0000-0000-0000-000000000001','Synthetic private message');
set local request.jwt.claims='{"sub":"77000000-0000-0000-0000-000000000002","aal":"aal1"}';
do $$
begin
 if (select count(*) from public.transport_messages where body='Synthetic private message')<>1
 or (select count(*) from public.notifications where event='transport_message' and conversation_id=current_setting('dz_test.chat')::uuid)<>1
 then raise exception 'Carrier chat or retry incorrect'; end if;
end $$;
select public.mark_notification_read(id) from public.notifications where event='transport_message';
select public.send_transport_message(:'chat','77200000-0000-0000-0000-000000000003','Synthetic carrier reply');
set local request.jwt.claims='{"sub":"77000000-0000-0000-0000-000000000001","aal":"aal1"}';
do $$
begin
 if not exists(select 1 from public.transport_messages where body='Synthetic carrier reply'
  and conversation_id=current_setting('dz_test.chat')::uuid) then raise exception 'Customer cannot read carrier reply'; end if;
end $$;


set local request.jwt.claims='{"sub":"77000000-0000-0000-0000-000000000005","aal":"aal1"}';
do $$
begin
 if exists(select from public.transport_messages) or exists(select from public.transport_conversations)
  or exists(select from public.transport_quotes) then raise exception 'Third-party quote or chat read'; end if;
end $$;
set local request.jwt.claims='{"sub":"77000000-0000-0000-0000-000000000003","aal":"aal1"}';
select public.confirm_carrier_fee_terms(id,100000,'EUR','pro') from public.carrier_fee_terms;
set local request.jwt.claims='{"sub":"77000000-0000-0000-0000-000000000004","aal":"aal2"}';
do $$
begin
 if exists(select from public.transport_messages) then raise exception 'Manager chat read'; end if;
end $$;
select public.replace_transport_carrier(:'order_id','77000000-0000-0000-0000-000000000003','Replacement fixture','Synthetic replacement');
do $$
begin
 if (select count(*) from public.carrier_fees where voided_at is null and fee_minor=5000 and plan='pro')<>1
 or (select count(*) from public.carrier_fees where voided_at is not null and fee_minor=7000 and plan='basic')<>1
 then raise exception 'Replacement fee incorrect'; end if;
end $$;

set local request.jwt.claims='{"sub":"77000000-0000-0000-0000-000000000002","aal":"aal1"}';
do $$
begin
 if exists(select from public.transport_messages) or exists(select from public.transport_conversations)
 then raise exception 'Former carrier retained chat'; end if;
 begin
  perform public.send_transport_message(current_setting('dz_test.chat')::uuid,'77200000-0000-0000-0000-000000000002','Revoked');
  raise exception 'Former carrier sent message' using errcode='XX000';
 exception when raise_exception then null; end;
end $$;
set local request.jwt.claims='{"sub":"77000000-0000-0000-0000-000000000003","aal":"aal1"}';
do $$
begin
 if (select count(*) from public.transport_conversations where id<>current_setting('dz_test.chat')::uuid)<>1
 or exists(select from public.transport_messages) then raise exception 'Replacement conversation not isolated'; end if;
end $$;
set local request.jwt.claims='{"sub":"77000000-0000-0000-0000-000000000004","aal":"aal2"}';
select public.advance_transport(current_setting('dz_test.inquiry')::uuid,'cancelled');
select public.void_carrier_fee(id,'Synthetic cancellation') from public.carrier_fees where voided_at is null;
do $$
begin
 if (select count(*) from public.carrier_fees where voided_at is not null)<>2
 or not exists(select from public.audit_logs where entity='carrier_fee' and action='void')
 then raise exception 'Cancellation audit missing'; end if;
end $$;
reset role;
insert into public.carrier_fees(order_id,assignment_id,partner_id,reference,plan,rate,base_minor,currency,voided_at)
select a.order_id,a.id,a.partner_id,i.reference,'free',10,amount,'EUR',now()
from public.transport_assignments a join public.transport_orders o on o.id=a.order_id
join public.transport_inquiries i on i.id=o.inquiry_id cross join (values (4),(5)) as rounding(amount)
where a.order_id=:'order_id';
do $$
begin
 if (select count(*) from public.carrier_fees where order_id=current_setting('dz_test.order')::uuid
  and (base_minor,fee_minor) in ((4,0),(5,1)))<>2 then raise exception 'Fee rounding incorrect'; end if;
end $$;
rollback;
