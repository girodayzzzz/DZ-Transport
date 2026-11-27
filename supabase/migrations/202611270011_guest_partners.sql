begin;

create table dz_private.guest_partner_receipts (
 client_reference text primary key check(client_reference ~ '^DZT-[0-9]{8}-[A-Z0-9]{6}$'),
 application_id uuid not null unique references public.partner_applications on delete cascade,
 network_key text not null check(network_key ~ '^[0-9a-f]{64}$'),
 payload jsonb not null,
 created_at timestamptz not null default now()
);
create index guest_partner_network on dz_private.guest_partner_receipts(network_key,created_at);
alter table dz_private.guest_partner_receipts enable row level security;
revoke all on dz_private.guest_partner_receipts from public,anon,authenticated;

create function public.ingest_guest_partner(p_ref text,p_network text,p_payload jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare saved uuid; original jsonb;
begin
 if p_ref is null or p_ref !~ '^DZT-[0-9]{8}-[A-Z0-9]{6}$' or p_network is null or p_network !~ '^[0-9a-f]{64}$'
  or p_payload is null or octet_length(p_payload::text)>60000
  or p_payload->>'reference' is distinct from p_ref or p_payload->'permission'->'privacy' is distinct from 'true'::jsonb
  or jsonb_typeof(p_payload->'application') is distinct from 'object' then
  raise exception 'Invalid application';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_ref,3));
 select application_id,payload into saved,original from dz_private.guest_partner_receipts where client_reference=p_ref;
 if found then
  if original=p_payload then return saved; end if;
  raise exception 'Reference conflict' using errcode='23505';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_network,4));
 if (select count(*) from dz_private.guest_partner_receipts
      where network_key=p_network and created_at>now()-interval '1 hour')>=8 then
  raise exception 'Rate limit' using errcode='P0002';
 end if;
 insert into public.partner_applications(applicant_id) values(null) returning id into saved;
 insert into dz_private.guest_partner_receipts(client_reference,application_id,network_key,payload)
 values(p_ref,saved,p_network,p_payload);
 insert into public.notifications(recipient_id,event)
 select user_id,'partner_applied' from public.user_roles where role='admin' and approved;
 return saved;
end $$;

create function public.manager_guest_partner_details(p_application uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select payload from dz_private.guest_partner_receipts
 where application_id=p_application and dz_private.has_role('admin');
$$;

revoke execute on function public.ingest_guest_partner(text,text,jsonb),public.manager_guest_partner_details(uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.ingest_guest_partner(text,text,jsonb) to service_role;
grant execute on function public.manager_guest_partner_details(uuid) to authenticated;

commit;
