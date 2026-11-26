begin;
create table dz_private.guest_receipts (
 client_reference text primary key check (client_reference ~ '^DZT-[0-9]{8}-[A-Z0-9]{6}$'),
 inquiry_id uuid not null unique references public.transport_inquiries on delete cascade,
 network_key text not null check (length(network_key)=64),
 payload jsonb not null,
 created_at timestamptz not null default now()
);
create index on dz_private.guest_receipts(network_key,created_at);
alter table dz_private.guest_receipts enable row level security;

create function public.ingest_guest_inquiry(p_ref text,p_network text,p_email text,p_origin text,p_destination text,p_category text,p_payload jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare saved uuid; receipt uuid; original jsonb; item jsonb;
begin
 if p_ref is null or p_network is null or p_payload is null or octet_length(p_payload::text)>60000 then
  raise exception 'Invalid request';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_ref,1));
 select g.payload,i.reference into original,receipt from dz_private.guest_receipts g
 join public.transport_inquiries i on i.id=g.inquiry_id where g.client_reference=p_ref;
 if found then
  if original=p_payload then return receipt; end if;
  raise exception 'Reference conflict';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_network,2));
 if (select count(*) from dz_private.guest_receipts
     where network_key=p_network and created_at>now()-interval '1 hour')>=8 then
  raise exception 'Rate limit' using errcode='P0002';
 end if;
 insert into public.transport_inquiries(customer_id,contact_email,origin,destination,description)
 values(null,p_email,p_origin,p_destination,p_category) returning id,reference into saved,receipt;
 insert into dz_private.guest_receipts(client_reference,inquiry_id,network_key,payload) values(p_ref,saved,p_network,p_payload);
 for item in select value from jsonb_array_elements(coalesce(p_payload->'cargo'->'items','[]'::jsonb)) loop
  insert into public.inquiry_items(inquiry_id,description,quantity)
  values(saved,coalesce(nullif(item->>'description',''),p_category),(item->>'quantity')::integer);
 end loop;
 return receipt;
end $$;

create function public.manager_guest_details(p_inquiry uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('reference',client_reference,'details',payload)
 from dz_private.guest_receipts where inquiry_id=p_inquiry and dz_private.has_role('admin');
$$;
revoke execute on function public.ingest_guest_inquiry(text,text,text,text,text,text,jsonb),public.manager_guest_details(uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.ingest_guest_inquiry(text,text,text,text,text,text,jsonb) to service_role;
grant execute on function public.manager_guest_details(uuid) to authenticated;
commit;
