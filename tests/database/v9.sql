begin;
insert into auth.users values
 ('99000000-0000-0000-0000-000000000001','manager@example.invalid',now()),
 ('99000000-0000-0000-0000-000000000002','carrier@example.invalid',now());
insert into public.user_roles(user_id,role,approved) values
 ('99000000-0000-0000-0000-000000000001','admin',true),
 ('99000000-0000-0000-0000-000000000002','partner',true);

set local role service_role;
do $$
declare ref text:='DZT-20261127-TEST01'; network text:=repeat('a',64);
 payload jsonb:='{"reference":"DZT-20261127-TEST01","language":"sl","application":{"company":"Test carrier"},"permission":{"privacy":true}}'; saved uuid;
begin
 saved:=public.ingest_guest_partner(ref,network,payload);
 if saved is distinct from public.ingest_guest_partner(ref,network,payload) then raise exception 'Retry produced a new record'; end if;
 perform set_config('dz.test.partner_application',saved::text,true);
 begin
  perform public.ingest_guest_partner(ref,network,payload || '{"application":{"company":"Other"}}');
  raise exception 'Reference collision was accepted';
 exception when unique_violation then null; end;
 for step in 2..8 loop
  ref:='DZT-20261127-TEST0'||step;
  perform public.ingest_guest_partner(ref,network,payload || jsonb_build_object('reference',ref));
 end loop;
 begin
  perform public.ingest_guest_partner('DZT-20261127-TEST09',network,payload || '{"reference":"DZT-20261127-TEST09"}');
  raise exception 'Rate limit was not enforced';
 exception when no_data_found then null; end;
end $$;
reset role;
do $$
begin
 if (select count(*) from public.partner_applications where applicant_id is null and state='pending')<>8
  or (select count(*) from public.user_roles)<>2
  or not exists(select 1 from public.notifications where recipient_id='99000000-0000-0000-0000-000000000001' and event='partner_applied')
 then raise exception 'Guest records or notifications are incorrect'; end if;
end $$;

set local role authenticated;
set local request.jwt.claims='{"sub":"99000000-0000-0000-0000-000000000002"}';
do $$
begin
 if public.manager_guest_partner_details(current_setting('dz.test.partner_application')::uuid) is not null
  or exists(select 1 from public.partner_applications) then raise exception 'Partner can see guest applicant'; end if;
 begin
  perform public.ingest_guest_partner(null,null,null);
  raise exception 'Authenticated user can call the privileged intake RPC';
 exception when insufficient_privilege then null; end;
end $$;
set local request.jwt.claims='{"sub":"99000000-0000-0000-0000-000000000001","aal":"aal1"}';
do $$
begin
 if public.manager_guest_partner_details(current_setting('dz.test.partner_application')::uuid) is not null
 then raise exception 'MFA was not required'; end if;
end $$;
set local request.jwt.claims='{"sub":"99000000-0000-0000-0000-000000000001","aal":"aal2"}';
do $$
begin
 if (public.manager_guest_partner_details(current_setting('dz.test.partner_application')::uuid)#>>'{application,company}') is distinct from 'Test carrier'
  or not exists(select 1 from public.partner_applications where id=current_setting('dz.test.partner_application')::uuid and state='pending')
 then raise exception 'Manager cannot access the application'; end if;
end $$;
rollback;
