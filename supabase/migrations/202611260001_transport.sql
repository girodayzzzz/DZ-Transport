begin;
create schema dz_private;
revoke all on schema dz_private from public;
grant usage on schema dz_private to authenticated;

create type public.transport_status as enum (
 'new_inquiry','under_review','awaiting_carrier_offer','offer_prepared','offer_sent',
 'customer_accepted','carrier_assigned','scheduled','picked_up','in_transit','delivered','completed','cancelled'
);

create table public.profiles (
 id uuid primary key references auth.users on delete cascade,
 display_name text not null default '' check (length(display_name)<=120),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.user_roles (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users on delete cascade,
 role text not null check (role in ('partner','admin')),
 approved boolean not null default false,
 unique (user_id,role),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.companies (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid unique references auth.users on delete set null default auth.uid(),
 name text not null check (length(trim(name)) between 1 and 160),
 coverage text not null check (length(trim(coverage)) between 1 and 500),
 services text not null check (length(trim(services)) between 1 and 500),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.partner_applications (
 id uuid primary key default gen_random_uuid(),
 applicant_id uuid unique references auth.users on delete set null default auth.uid(),
 state text not null default 'pending' check (state in ('pending','approved','rejected','suspended')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.transport_inquiries (
 id uuid primary key default gen_random_uuid(),
 reference uuid not null unique default gen_random_uuid(),
 customer_id uuid references auth.users on delete set null default auth.uid(),
 contact_name text not null default '' check (length(contact_name)<=120),
 contact_email text not null check (length(contact_email) between 3 and 254),
 origin text not null check (length(trim(origin)) between 1 and 250),
 destination text not null check (length(trim(destination)) between 1 and 250),
 description text not null check (length(trim(description)) between 1 and 4000),
 status public.transport_status not null default 'new_inquiry',
 archived_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index on public.transport_inquiries(customer_id, created_at desc);
create table public.inquiry_items (
 id uuid primary key default gen_random_uuid(),
 inquiry_id uuid not null references public.transport_inquiries on delete cascade,
 description text not null check (length(trim(description)) between 1 and 500),
 quantity integer not null check (quantity between 1 and 1000000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index on public.inquiry_items(inquiry_id);
-- Carriers receive a separate, manually curated opportunity with no customer contact fields.
create table public.transport_opportunities (
 id uuid primary key default gen_random_uuid(),
 inquiry_id uuid not null references public.transport_inquiries on delete cascade,
 partner_id uuid not null references auth.users on delete cascade,
 summary text not null check (length(trim(summary)) between 1 and 1500),
 open boolean not null default true,
 unique (inquiry_id, partner_id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index on public.transport_opportunities(partner_id);
create table public.transport_quotes (
 id uuid primary key default gen_random_uuid(),
 inquiry_id uuid not null references public.transport_inquiries on delete cascade,
 opportunity_id uuid unique references public.transport_opportunities on delete cascade,
 amount_minor integer not null check (amount_minor between 1 and 1000000000),
 currency text not null check (currency in ('EUR','CHF','GBP')),
 vat_treatment text not null check (length(trim(vat_treatment)) between 1 and 250),
 valid_until date not null,
 status text not null default 'draft' check (status in ('draft','sent','accepted','withdrawn')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index on public.transport_quotes(inquiry_id);
create unique index on public.transport_quotes(inquiry_id) where status='accepted' and opportunity_id is null;
create table public.quote_costs (
 id uuid primary key default gen_random_uuid(),
 quote_id uuid not null unique references public.transport_quotes on delete cascade,
 carrier_minor integer not null check (carrier_minor between 0 and 1000000000),
 expenses_minor integer not null check (expenses_minor between 0 and 1000000000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.transport_orders (
 id uuid primary key default gen_random_uuid(),
 inquiry_id uuid not null unique references public.transport_inquiries on delete cascade,
 quote_id uuid not null unique references public.transport_quotes,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.transport_assignments (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null unique references public.transport_orders on delete cascade,
 partner_id uuid references auth.users on delete set null,
 instructions text not null check (length(trim(instructions)) between 1 and 4000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index on public.transport_assignments(partner_id);
create table public.transport_status_history (
 id uuid primary key default gen_random_uuid(),
 inquiry_id uuid not null references public.transport_inquiries on delete cascade,
 status public.transport_status not null,
 created_at timestamptz not null default now()
);
create index on public.transport_status_history(inquiry_id, created_at);
create table public.notifications (
 id uuid primary key default gen_random_uuid(),
 recipient_id uuid not null references auth.users on delete cascade,
 event text not null check (event in ('inquiry_received','partner_applied','offer_prepared','offer_accepted','status_changed')),
 read_at timestamptz,
 created_at timestamptz not null default now()
);
create index on public.notifications(recipient_id, created_at desc);
create table public.internal_notes (
 id uuid primary key default gen_random_uuid(),
 inquiry_id uuid not null references public.transport_inquiries on delete cascade,
 author_id uuid references auth.users on delete set null default auth.uid(),
 body text not null check (length(trim(body)) between 1 and 4000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index on public.internal_notes(inquiry_id);
create table public.audit_logs (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid references auth.users on delete set null,
 entity text not null,
 record_id uuid not null,
 action text not null,
 created_at timestamptz not null default now()
);
create index on public.audit_logs(created_at);

create function dz_private.confirmed() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null);
$$;
create function dz_private.has_role(requested text) returns boolean
language sql stable security definer set search_path='' as $$
 select dz_private.confirmed() and exists(select 1 from public.user_roles
  where user_id=auth.uid() and role=requested and approved)
  and (requested <> 'admin' or coalesce(auth.jwt()->>'aal','')='aal2');
$$;
create function dz_private.owns_inquiry(inquiry uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select dz_private.confirmed() and exists(select 1 from public.transport_inquiries where id=inquiry and customer_id=auth.uid());
$$;
create function dz_private.assigned(inquiry uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select dz_private.has_role('partner') and exists(
  select 1 from public.transport_assignments a join public.transport_orders o on o.id=a.order_id
  where o.inquiry_id=inquiry and a.partner_id=auth.uid());
$$;

do $$
declare t text;
begin
 foreach t in array array['profiles','user_roles','companies','partner_applications','transport_inquiries','inquiry_items',
 'transport_opportunities','transport_quotes','quote_costs','transport_orders','transport_assignments',
 'transport_status_history','notifications','internal_notes','audit_logs'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public, anon, authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy admin_read on public.%I for select to authenticated using ((select dz_private.has_role(''admin'')))',t);
 end loop;
end $$;

create policy own_profile on public.profiles for all to authenticated
 using (id=(select auth.uid()) and (select dz_private.confirmed()))
 with check (id=(select auth.uid()) and (select dz_private.confirmed()));
grant insert(id,display_name), update(display_name) on public.profiles to authenticated;

create policy own_roles on public.user_roles for select to authenticated using (
 user_id=(select auth.uid()) and (select dz_private.confirmed()));
create policy own_company on public.companies for select to authenticated using (
 owner_id=(select auth.uid()) and (select dz_private.confirmed()));
create policy own_application on public.partner_applications for select to authenticated using (
 applicant_id=(select auth.uid()) and (select dz_private.confirmed()));
create policy own_inquiry on public.transport_inquiries for select to authenticated using (
 customer_id=(select auth.uid()) and (select dz_private.confirmed()));
create policy own_items on public.inquiry_items for select to authenticated using (dz_private.owns_inquiry(inquiry_id));
create policy invited_partner on public.transport_opportunities for select to authenticated using (
 partner_id=(select auth.uid()) and (select dz_private.has_role('partner')));
create policy visible_quote on public.transport_quotes for select to authenticated using (
 (opportunity_id is null and status in ('sent','accepted','withdrawn') and dz_private.owns_inquiry(inquiry_id))
 or (opportunity_id is not null and exists(select 1 from public.transport_opportunities o
  where o.id=opportunity_id and o.partner_id=(select auth.uid()) and (select dz_private.has_role('partner')))));
create policy own_order on public.transport_orders for select to authenticated using (
 dz_private.owns_inquiry(inquiry_id) or dz_private.assigned(inquiry_id));
create policy own_assignment on public.transport_assignments for select to authenticated using (
 partner_id=(select auth.uid()) and (select dz_private.has_role('partner')));
create policy own_history on public.transport_status_history for select to authenticated using (
 dz_private.owns_inquiry(inquiry_id) or dz_private.assigned(inquiry_id));
create policy own_notifications on public.notifications for select to authenticated using (
 recipient_id=(select auth.uid()) and (select dz_private.confirmed()) and
 (event='status_changed' or (select dz_private.has_role('admin'))));

create function dz_private.touch() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=now(); return new; end;
$$;
create function dz_private.audit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.audit_logs(actor_id,entity,record_id,action)
 values (auth.uid(),tg_table_name,coalesce(new.id,old.id),tg_op);
 return null;
end;
$$;
create function dz_private.inquiry_history() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' or new.status is distinct from old.status then
  insert into public.transport_status_history(inquiry_id,status) values(new.id,new.status);
  if tg_op='INSERT' then
   insert into public.notifications(recipient_id,event)
   select user_id,'inquiry_received' from public.user_roles where role='admin' and approved;
  else
   if new.customer_id is not null then
    insert into public.notifications(recipient_id,event) values(new.customer_id,'status_changed');
   end if;
   insert into public.notifications(recipient_id,event)
   select a.partner_id,'status_changed' from public.transport_assignments a
   join public.transport_orders o on o.id=a.order_id
   join public.user_roles r on r.user_id=a.partner_id and r.role='partner' and r.approved
   where o.inquiry_id=new.id and a.partner_id is distinct from new.customer_id;
  end if;
 end if;
 return null;
end;
$$;
create trigger inquiry_history after insert or update on public.transport_inquiries for each row execute function dz_private.inquiry_history();
do $$
declare t text;
begin
 foreach t in array array['profiles','user_roles','companies','partner_applications','transport_inquiries','inquiry_items',
 'transport_opportunities','transport_quotes','quote_costs','transport_orders','transport_assignments','internal_notes'] loop
  execute format('create trigger touch before update on public.%I for each row execute function dz_private.touch()',t);
  execute format('create trigger audit after insert or update or delete on public.%I for each row execute function dz_private.audit()',t);
 end loop;
end $$;

revoke execute on all functions in schema dz_private from public, anon, authenticated;
grant execute on function dz_private.confirmed(),dz_private.has_role(text),dz_private.owns_inquiry(uuid),dz_private.assigned(uuid) to authenticated;
commit;
