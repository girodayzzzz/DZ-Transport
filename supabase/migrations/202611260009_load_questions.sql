begin;

create table dz_private.published_loads (
 inquiry_id uuid primary key references public.transport_inquiries on delete cascade,
 public_id uuid not null unique default gen_random_uuid(),
 category text not null check (category in ('vehicle','pallet','cargo','moving','express','special')),
 origin_country text not null check (origin_country in ('SI','AT','DE','IT','HR','HU','FR','NL','BE','CH','GB','PL','CZ','SK')),
 destination_country text not null check (destination_country in ('SI','AT','DE','IT','HR','HU','FR','NL','BE','CH','GB','PL','CZ','SK')),
 test_data boolean not null default false,
 published boolean not null default false
);
create function dz_private.is_public_load(p_inquiry uuid) returns boolean
language sql stable set search_path='' as $$
 select exists(
  select 1 from dz_private.published_loads l join public.transport_inquiries i on i.id=l.inquiry_id
  where l.inquiry_id=p_inquiry and l.published and i.archived_at is null and i.status='awaiting_carrier_offer'
  and not exists(select 1 from dz_private.quick_deals d where d.inquiry_id=i.id and d.cancelled_at is null)
 );
$$;
create function public.publish_load(p_inquiry uuid,p_category text,p_origin text,p_destination text,p_test boolean,p_published boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare publication uuid;
begin
 if not dz_private.has_role('admin') then raise exception 'Unavailable'; end if;
 perform 1 from public.transport_inquiries where id=p_inquiry for update;
 if not found or (p_published and not exists(
  select 1 from public.transport_inquiries i where i.id=p_inquiry and i.status='awaiting_carrier_offer'
   and i.archived_at is null and not exists(
    select 1 from dz_private.quick_deals d where d.inquiry_id=i.id and d.cancelled_at is null
   )
 )) then raise exception 'Unavailable'; end if;
 insert into dz_private.published_loads(inquiry_id,category,origin_country,destination_country,test_data,published)
 values(p_inquiry,p_category,p_origin,p_destination,p_test,p_published)
 on conflict(inquiry_id) do update set category=excluded.category,origin_country=excluded.origin_country,
 destination_country=excluded.destination_country,test_data=excluded.test_data,published=excluded.published
 returning public_id into publication;
 return publication;
end $$;

create table dz_private.load_questions (
 id uuid primary key default gen_random_uuid(),
 inquiry_id uuid not null references public.transport_inquiries on delete cascade,
 author_id uuid references auth.users on delete set null,
 question text not null check (length(trim(question)) between 1 and 1000),
 answer text check (length(trim(answer)) between 1 and 1500),
 public_submission boolean not null,
 question_public boolean not null default false,
 answer_public boolean not null default false,
 hidden boolean not null default false,
 created_at timestamptz not null default now()
);
alter table dz_private.published_loads enable row level security;
alter table dz_private.load_questions enable row level security;
revoke all on dz_private.published_loads,dz_private.load_questions from public,anon,authenticated;
create index on dz_private.load_questions(inquiry_id,created_at);
create index on dz_private.load_questions(author_id,created_at);

create function dz_private.can_ask_load(p_inquiry uuid) returns boolean
language sql stable set search_path='' as $$
 select dz_private.has_role('partner') and not dz_private.owns_inquiry(p_inquiry) and (
  exists(select 1 from public.transport_opportunities o join public.transport_inquiries i on i.id=o.inquiry_id
   where o.inquiry_id=p_inquiry and o.partner_id=auth.uid() and o.open and i.archived_at is null
    and i.status='awaiting_carrier_offer')
  or exists(select 1 from dz_private.quick_deals d join public.list_quick_deals() eligible on eligible.id=d.id
   where d.inquiry_id=p_inquiry)
  or dz_private.is_public_load(p_inquiry)
 );
$$;

create function dz_private.can_review_load(p_inquiry uuid) returns boolean
language sql stable set search_path='' as $$
 select dz_private.has_role('admin') or dz_private.owns_inquiry(p_inquiry) or dz_private.assigned(p_inquiry)
 or (dz_private.has_role('partner') and exists(select 1 from public.transport_opportunities
  where inquiry_id=p_inquiry and partner_id=auth.uid()))
 or (dz_private.has_role('partner') and exists(
  select 1 from dz_private.quick_deals d join public.list_quick_deals() eligible on eligible.id=d.id
  where d.inquiry_id=p_inquiry
 ));
$$;

create function public.quick_deal_load(p_deal uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select d.inquiry_id from dz_private.quick_deals d join public.list_quick_deals() eligible on eligible.id=d.id
 where d.id=p_deal;
$$;

create function public.load_publication(p_inquiry uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select public_id from dz_private.published_loads where inquiry_id=p_inquiry and dz_private.is_public_load(p_inquiry)
 and (dz_private.can_review_load(p_inquiry) or dz_private.can_ask_load(p_inquiry));
$$;

create function public.public_load(p_load uuid)
returns table(category text,origin_country text,destination_country text,test_data boolean,can_ask boolean)
language sql stable security definer set search_path='' as $$
 select l.category,l.origin_country,l.destination_country,l.test_data,dz_private.can_ask_load(l.inquiry_id)
 from dz_private.published_loads l where l.public_id=p_load and dz_private.is_public_load(l.inquiry_id);
$$;
create function public.public_load_questions(p_load uuid)
returns table(question text,answer text,created_at timestamptz)
language sql stable security definer set search_path='' as $$
 select q.question,case when q.answer_public then q.answer end,q.created_at
 from dz_private.load_questions q join dz_private.published_loads l on l.inquiry_id=q.inquiry_id
 where l.public_id=p_load and dz_private.is_public_load(l.inquiry_id)
 and q.public_submission and q.question_public and not q.hidden
 order by q.created_at desc limit 100;
$$;

create function public.list_load_questions(p_inquiry uuid)
returns table(id uuid,question text,answer text,public_submission boolean,question_public boolean,
 answer_public boolean,hidden boolean,created_at timestamptz)
language sql stable security definer set search_path='' as $$
 select q.id,q.question,q.answer,q.public_submission,q.question_public,q.answer_public,q.hidden,q.created_at
 from dz_private.load_questions q where q.inquiry_id=p_inquiry
 and (dz_private.can_review_load(p_inquiry) or dz_private.can_ask_load(p_inquiry))
 and (dz_private.has_role('admin') or (not q.hidden and (
  (q.public_submission and (q.question_public or q.author_id=auth.uid() or dz_private.owns_inquiry(p_inquiry)))
  or (not q.public_submission and dz_private.can_review_load(p_inquiry))
 )))
 and (not q.public_submission or q.answer is null or q.answer_public or q.author_id=auth.uid()
  or dz_private.owns_inquiry(p_inquiry) or dz_private.has_role('admin') or dz_private.can_review_load(p_inquiry))
 order by q.created_at desc limit 100;
$$;

create function public.ask_load_question(p_load uuid,p_public boolean,p_body text) returns void
language plpgsql security definer set search_path='' as $$
declare inquiry uuid;
begin
 if not dz_private.has_role('partner') then raise exception 'Unavailable'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,7));
 if p_public then
  select inquiry_id into inquiry from dz_private.published_loads where public_id=p_load and dz_private.is_public_load(inquiry_id);
 else
  inquiry:=p_load;
  if not dz_private.can_review_load(inquiry) or dz_private.is_public_load(inquiry) then raise exception 'Unavailable'; end if;
 end if;
 if inquiry is null or not dz_private.can_ask_load(inquiry)
 or exists(select 1 from dz_private.load_questions where author_id=auth.uid()
  and created_at>clock_timestamp()-interval '15 seconds')
 or (select count(*) from dz_private.load_questions where author_id=auth.uid()
  and created_at>clock_timestamp()-interval '1 hour')>=15 then raise exception 'Unavailable'; end if;
 if p_public and p_body ~* '(@|https?://|www\.|\+?[0-9][0-9 ./()-]{6,}[0-9])' then
  raise exception 'Contact information is not permitted';
 end if;
 insert into dz_private.load_questions(inquiry_id,author_id,question,public_submission)
 values(inquiry,auth.uid(),trim(p_body),p_public);
end $$;

create function public.answer_load_question(p_question uuid,p_body text) returns void
language plpgsql security definer set search_path='' as $$
begin
 update dz_private.load_questions q set answer=trim(p_body),answer_public=false
 where q.id=p_question and not q.hidden
 and (dz_private.owns_inquiry(q.inquiry_id) or dz_private.has_role('admin'))
 and not (q.public_submission and (p_body ~* '(@|https?://|www\.|\+?[0-9][0-9 ./()-]{6,}[0-9])'));
 if not found then raise exception 'Unavailable'; end if;
end $$;
create function public.moderate_load_question(p_question uuid,p_action text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not dz_private.has_role('admin') or not coalesce(p_action in ('publishQuestion','publishAnswer','hideQuestion'),false) then
  raise exception 'Unavailable';
 end if;
 update dz_private.load_questions set
  question_public=case when p_action='publishQuestion' then true else question_public end,
  answer_public=case when p_action='publishAnswer' then true else answer_public end,
  hidden=(p_action='hideQuestion')
 where id=p_question and (p_action='hideQuestion' or public_submission)
 and (p_action<>'publishAnswer' or (question_public and answer is not null));
 if not found then raise exception 'Unavailable'; end if;
 insert into public.audit_logs(actor_id,entity,record_id,action)
 values(auth.uid(),'load_question',p_question,p_action);
end $$;

revoke execute on function dz_private.can_ask_load(uuid),dz_private.can_review_load(uuid),
 dz_private.is_public_load(uuid) from public,anon,authenticated;
do $$
declare signature regprocedure;
begin
 foreach signature in array array['public.publish_load(uuid,text,text,text,boolean,boolean)',
 'public.quick_deal_load(uuid)','public.load_publication(uuid)','public.list_load_questions(uuid)',
 'public.ask_load_question(uuid,boolean,text)','public.answer_load_question(uuid,text)',
 'public.moderate_load_question(uuid,text)','public.public_load(uuid)','public.public_load_questions(uuid)']::regprocedure[] loop
  execute format('revoke execute on function %s from public,anon,authenticated',signature);
  execute format('grant execute on function %s to authenticated',signature);
 end loop;
end $$;
grant execute on function public.public_load(uuid),public.public_load_questions(uuid) to anon;
commit;
