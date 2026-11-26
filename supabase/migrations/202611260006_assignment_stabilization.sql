begin;

create function dz_private.assign_accepted_order(p_order uuid,p_partner uuid,p_instructions text)
returns void language plpgsql security definer set search_path='' as $$
declare inquiry uuid;
begin
 if not dz_private.has_role('admin') then raise exception 'Unavailable'; end if;
 select i.id into inquiry from public.transport_orders o
 join public.transport_inquiries i on i.id=o.inquiry_id
 where o.id=p_order and i.status='customer_accepted' for update of i;
 if not found then raise exception 'Unavailable'; end if;

 -- Serialize with revocation of the approval and reject assigning one's own cargo.
 perform 1 from public.user_roles r join public.transport_inquiries i on i.id=inquiry
 where r.user_id=p_partner and r.role='partner' and r.approved
 and i.customer_id is distinct from p_partner for share of r;
 if not found then raise exception 'Unavailable'; end if;

 insert into public.transport_assignments(order_id,partner_id,instructions)
 values(p_order,p_partner,p_instructions);
 -- The timeline trigger needs the assignment in place to notify both participants.
 update public.transport_inquiries set status='carrier_assigned' where id=inquiry;
end $$;
revoke execute on function dz_private.assign_accepted_order(uuid,uuid,text) from public,anon,authenticated;

create or replace function public.assign_transport(p_order uuid,p_partner uuid,p_instructions text)
returns void language sql security definer set search_path='' as $$
 select dz_private.assign_accepted_order(p_order,p_partner,p_instructions);
$$;

commit;
