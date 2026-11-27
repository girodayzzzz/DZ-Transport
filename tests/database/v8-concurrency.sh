#!/usr/bin/env bash
set -euo pipefail

# Run against a disposable database after the V8 migration.
work_dir=$(mktemp -d)
winner=
trap 'if test -n "$winner"; then touch "$work_dir/release"; wait "$winner" || true; fi; rm -rf "$work_dir"' EXIT
psql_args=(-X -qAt -v ON_ERROR_STOP=1)
payment=89100000-0000-0000-0000-000000000001
psql "${psql_args[@]}" -f tests/database/v8-concurrency-fixture.sql >"$work_dir/setup"
deal=$(psql "${psql_args[@]}" -c "select deal_id from public.transport_payments where id='$payment'")
test -n "$deal"

psql "${psql_args[@]}" >"$work_dir/winner" <<SQL &
begin;
set local role authenticated;
set local request.jwt.claims='{"sub":"89000000-0000-0000-0000-000000000002"}';
select public.v8_accept_quick_deal('$deal',50000,'free');
\! touch '$work_dir/claimed'
\! while test ! -f '$work_dir/release'; do sleep .05; done
commit;
SQL
winner=$!
for attempt in {1..100}; do
 test ! -f "$work_dir/claimed" || break
 sleep .05
done
test -f "$work_dir/claimed"

PGAPPNAME=dz_v8_contender psql "${psql_args[@]}" >"$work_dir/contender" 2>&1 <<SQL &
set role authenticated;
set request.jwt.claims='{"sub":"89000000-0000-0000-0000-000000000003"}';
select public.v8_accept_quick_deal('$deal',50000,'free');
SQL
contender=$!
for attempt in {1..100}; do
 if test "$(psql "${psql_args[@]}" -c "select count(*) from pg_stat_activity where application_name='dz_v8_contender' and wait_event_type='Lock'")" = 1; then
  touch "$work_dir/contended"
  break
 fi
 sleep .05
done
touch "$work_dir/release"
wait "$winner"
winner=
test -f "$work_dir/contended"
if wait "$contender"; then
 echo 'Second carrier unexpectedly accepted a paid Quick Deal' >&2
 exit 1
fi
grep -q 'Unavailable' "$work_dir/contender"
test "$(psql "${psql_args[@]}" -c "select partner_id from public.transport_payments where id='$payment'")" = 89000000-0000-0000-0000-000000000002
test "$(psql "${psql_args[@]}" -c "select count(*) from public.transport_assignments a join public.transport_orders o on o.id=a.order_id join public.transport_payments p on p.inquiry_id=o.inquiry_id where p.id='$payment'")" = 1
echo 'Exactly one eligible carrier accepted the paid Quick Deal under contention.'
