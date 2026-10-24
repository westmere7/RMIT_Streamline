-- =============================================================================
-- 0111_admins_edit_profiles.sql
--
-- Admins edit their members' details, joined or not.
--
-- 0089 made a person's details theirs alone once they had joined; an admin could
-- only fill them in while the person was pending. That is lifted: who may change
-- somebody else's profile is now only the update policy (profiles_update_admin,
-- unchanged): an admin of every workspace the person is active in, and an
-- Owner's profile only by an Owner.
--
-- An email is not changed by a direct update from anybody, the person included.
-- It is the sign-in address too, and one person has one email: it changes only
-- through the server (POST /api/people/<id>/email), which updates the account
-- and the profile together and runs with no session, which this guard lets
-- through. 0089 let a person change their own profile email, which left their
-- sign-in address behind.
-- =============================================================================

create or replace function private.profile_edit_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if new.email is distinct from old.email then
    raise exception 'An email is changed from Members, so sign-in changes with it.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
