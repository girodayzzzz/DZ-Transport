begin;
-- The owner chooses the cutoff after reviewing contractual, tax and privacy obligations.
create function dz_private.purge_archived_inquiries(p_cutoff timestamptz)
returns bigint language plpgsql set search_path='' as $$
declare removed bigint;
begin
 if p_cutoff is null or p_cutoff>=now() then raise exception 'Invalid cutoff'; end if;
 delete from public.transport_inquiries
 where archived_at<p_cutoff and status in ('completed','cancelled');
 get diagnostics removed=row_count;
 return removed;
end $$;
revoke execute on function dz_private.purge_archived_inquiries(timestamptz) from public,anon,authenticated,service_role;
commit;
