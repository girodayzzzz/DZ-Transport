#!/usr/bin/env bash
set -euo pipefail

# Run after migrations on a disposable test database with bootstrap.sql applied.
work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT
psql_args=(-X -qAt -v ON_ERROR_STOP=1)
base_id=55000000-0000-0000-0000-00000000000

psql "${psql_args[@]}" >"$work_dir/setup" <<SQL
insert into auth.users values
 ('${base_id}1','admin@example.invalid',now()),
 ('${base_id}2','carrier1@example.invalid',now()),
 ('${base_id}3','carrier2@example.invalid',now());
insert into public.user_roles(user_id,role,approved) values
 ('${base_id}1','admin',true),('${base_id}2','partner',true),('${base_id}3','partner',true);
insert into public.transport_inquiries(id,contact_email,origin,destination,description,status)
 values('${base_id}4','buyer@example.invalid','SI','DE','Concurrency fixture','awaiting_carrier_offer');
update dz_private.quick_deal_settings set enabled=true;
set role authenticated;
set request.jwt.claims='{"sub":"${base_id}1","aal":"aal2"}';
select public.draft_quick_deal('${base_id}4','Pallets','SI','DE',daterange(current_date+1,current_date+2),
 daterange(current_date+2,current_date+3),'Van',100,'Fixture dimensions',45000,'EUR','Fixture VAT','','Insurance',
 now()+interval '1 day') as deal \gset
select public.publish_quick_deal(:'deal');
select public.attest_quick_deal_eligibility(:'deal','${base_id}2',now()+interval '1 day');
select public.attest_quick_deal_eligibility(:'deal','${base_id}3',now()+interval '1 day');
select :'deal';
SQL
deal_id=$(tail -n 1 "$work_dir/setup")
test -n "$deal_id"

request() {
 psql "${psql_args[@]}" <<SQL
set role authenticated;
set request.jwt.claims='{"sub":"${base_id}$1","aal":"aal1"}';
select public.request_quick_deal('$deal_id');
SQL
}
request 2 >"$work_dir/request2" &
request_two=$!
request 3 >"$work_dir/request3" &
request_three=$!
wait "$request_two"
wait "$request_three"

# Hold the winning lock open until the other session is waiting. This tests actual contention.
psql "${psql_args[@]}" >"$work_dir/winner" <<SQL &
begin;
set local role authenticated;
set local request.jwt.claims='{"sub":"${base_id}1","aal":"aal2"}';
select public.reserve_quick_deal('$deal_id','${base_id}2');
\! touch '$work_dir/reserved'
\! while test ! -f '$work_dir/contended' && test ! -f '$work_dir/abort'; do sleep .05; done
commit;
SQL
winner=$!
for attempt in {1..100}; do
 test ! -f "$work_dir/reserved" || break
 sleep .05
done
test -f "$work_dir/reserved"

PGAPPNAME=dz_quick_deal_contender psql "${psql_args[@]}" >"$work_dir/contender" 2>&1 <<SQL &
set role authenticated;
set request.jwt.claims='{"sub":"${base_id}1","aal":"aal2"}';
select public.reserve_quick_deal('$deal_id','${base_id}3');
SQL
contender=$!
for attempt in {1..100}; do
 if test "$(psql "${psql_args[@]}" -c "select count(*) from pg_stat_activity where application_name='dz_quick_deal_contender' and wait_event_type='Lock'")" = 1; then
  touch "$work_dir/contended"
  break
 fi
 sleep .05
done
touch "$work_dir/abort"
wait "$winner"
test -f "$work_dir/contended"
if wait "$contender"; then
 echo 'Competing reservation unexpectedly succeeded' >&2
 exit 1
fi
grep -q 'Already reserved' "$work_dir/contender"
test "$(psql "${psql_args[@]}" -c "select reserved_partner from dz_private.quick_deals where id='$deal_id'")" = "${base_id}2"
psql "${psql_args[@]}" <<SQL
delete from public.transport_inquiries where id='${base_id}4';
delete from auth.users where id in ('${base_id}1','${base_id}2','${base_id}3');
update dz_private.quick_deal_settings set enabled=false;
SQL
echo 'Concurrent Quick Deal requests and exclusive reservation passed.'
