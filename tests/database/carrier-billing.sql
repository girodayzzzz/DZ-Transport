begin;
insert into auth.users values
 ('13000000-0000-0000-0000-000000000001','approved@example.invalid',now()),
 ('13000000-0000-0000-0000-000000000002','other@example.invalid',now());
insert into public.user_roles(user_id,role,approved) values
 ('13000000-0000-0000-0000-000000000001','partner',true),
 ('13000000-0000-0000-0000-000000000002','partner',false);
insert into dz_private.carrier_plans values('13000000-0000-0000-0000-000000000001','pro');
set local role authenticated;
set local request.jwt.claims='{"sub":"13000000-0000-0000-0000-000000000002","aal":"aal1"}';
do $$
begin
 if public.my_carrier_billing() is not null or public.carrier_billing_actor() is not null then
  raise exception 'Unapproved carrier can read billing'; end if;
end $$;
set local request.jwt.claims='{"sub":"13000000-0000-0000-0000-000000000001","aal":"aal1"}';
do $$
begin
 if public.my_carrier_billing()->>'plan'<>'free' then raise exception 'Legacy manual plan still effective'; end if;
 begin
  perform public.carrier_billing_account(auth.uid(),'acct_fixture',true);
  raise exception 'Client can write billing' using errcode='XX000';
 exception when insufficient_privilege then null; end;
 begin
  perform count(*) from dz_private.carrier_billing;
  raise exception 'Client can read private IDs' using errcode='XX000';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
select public.carrier_billing_account('13000000-0000-0000-0000-000000000001','acct_fixture',true);
select public.carrier_billing_bind('13000000-0000-0000-0000-000000000001','acct_fixture','cus_fixture');
select set_config('billing.attempt',public.carrier_billing_reserve(
 '13000000-0000-0000-0000-000000000001','acct_fixture','basic','sl',null)->>'attempt',true);
do $$
declare carrier constant uuid:='13000000-0000-0000-0000-000000000001';
begin
 if public.carrier_billing_reserve(carrier,'acct_fixture','basic','de',null)->>'attempt'<>current_setting('billing.attempt')
  or public.carrier_billing_reserve(carrier,'acct_fixture','pro','de',null)->>'blocked'<>'checkout'
 then raise exception 'Checkout lock failed'; end if;
end $$;
select public.carrier_billing_apply('acct_fixture','cus_fixture',current_setting('billing.attempt')::uuid,
 'evt_created',1,'sub_fixture','basic','incomplete',now()+interval '1 month',false,null,null);
reset role;
do $$
begin
 if dz_private.carrier_plan('13000000-0000-0000-0000-000000000001')<>'free' then raise exception 'Checkout activated a paid plan'; end if;
end $$;
set local role service_role;
select public.carrier_billing_apply('acct_fixture','cus_fixture',current_setting('billing.attempt')::uuid,
 'evt_paid',2,'sub_fixture','basic','active',now()+interval '1 month',false,now()+interval '1 month',null);
select public.carrier_billing_apply('acct_fixture','cus_fixture',current_setting('billing.attempt')::uuid,
 'evt_paid',2,'sub_fixture','basic','active',now()+interval '1 month',false,now()+interval '1 month',null);
do $$
begin
 begin
  perform public.carrier_billing_apply('acct_fixture','cus_fixture',current_setting('billing.attempt')::uuid,
   'evt_stale',2,'sub_fixture','basic','incomplete',now()+interval '1 month',false,null,null);
  raise exception 'A stale concurrent update overwrote the paid subscription' using errcode='XX000';
 exception when raise_exception then null; end;
end $$;
select public.carrier_billing_apply('acct_fixture','cus_fixture',current_setting('billing.attempt')::uuid,
 'evt_failure',3,'sub_fixture','basic','past_due',now()+interval '2 months',false,null,null);
select public.carrier_billing_apply('acct_fixture','cus_fixture',current_setting('billing.attempt')::uuid,
 'evt_pendingcancel',4,'sub_fixture','basic','past_due',now()+interval '2 months',true,null,null);
reset role;
do $$
begin
 if dz_private.carrier_plan('13000000-0000-0000-0000-000000000001')<>'basic'
  or not exists(select 1 from dz_private.carrier_billing where paid_until=now()+interval '1 month' and cancel_at_end)
 then raise exception 'Failed renewal or end-of-period cancellation changed existing benefits'; end if;
end $$;
set local role service_role;
select public.carrier_billing_apply('acct_fixture','cus_fixture',current_setting('billing.attempt')::uuid,
 'evt_deleted',5,'sub_fixture','basic','canceled',now()+interval '2 months',false,null,now()-interval '1 second');
reset role;
do $$
begin
 if dz_private.carrier_plan('13000000-0000-0000-0000-000000000001')<>'free' then raise exception 'Expired carrier kept paid benefits'; end if;
 if (select count(*) from dz_private.carrier_billing_events)<>5 then raise exception 'Event deduplication failed'; end if;
end $$;
rollback;
