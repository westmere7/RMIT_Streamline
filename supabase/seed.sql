-- =============================================================================
-- RMIT Streamline - demo seed
--
-- Compact SQL equivalent of src/data/seed/seed-data.ts. Ids are the same
-- deterministic pseudo-UUIDs the TypeScript seed produces:
--
--     0000000<ns>-0000-4000-8000-<n padded to 12 digits>
--
--   ns 0 workspace   ns 1 users   ns 2 teams   ns 3 boards   ns 4 groups
--   ns 5 columns     ns 6 items   ns 8 comments ns 9 activities ns a notifications
--
-- User numbers: 1 danh, 2 emily, 3 jun, 4 joanne, 5 duc, 6 tuyet, 7 hil,
--               8 grace, 9 jane
-- Team numbers: 1 vietnam, 2 melbourne, 3 campaigns, 4 digital, 5 brand, 6 content
-- Board numbers: 1 sem1, 2 masterclass, 3 rmitinerary, 4 dooh, 5 requests, 6 alwayson
--
-- Dates are relative to the day the seed runs (current_date + n) so "My Work"
-- always has overdue / due-today / upcoming rows.
--
-- Run as the service role / postgres (bypasses RLS):
--   supabase db reset            (applies migrations then this file)
--   psql "$DATABASE_URL" -f supabase/seed.sql
--
-- Re-runnable: every insert uses ON CONFLICT DO NOTHING (profiles upsert their
-- descriptive fields so rows created by the auth trigger get filled in).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Session-local helpers (pg_temp is dropped when the connection closes)
-- -----------------------------------------------------------------------------

create or replace function pg_temp.sid(ns text, n integer)
returns uuid
language sql
immutable
as $$
  select ('0000000' || ns || '-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;

-- yyyy-MM-dd for current_date + n (matches toISODate(addDays(now, n))).
create or replace function pg_temp.rel_date(n integer)
returns text
language sql
stable
as $$
  select to_char(current_date + n, 'YYYY-MM-DD')
$$;

-- int[] of user numbers -> JSON array of user uuids (order preserved).
create or replace function pg_temp.user_ids(nums integer[])
returns jsonb
language sql
immutable
as $$
  select coalesce(
    (select jsonb_agg(pg_temp.sid('1', k) order by ord)
     from unnest(nums) with ordinality as o(k, ord)),
    '[]'::jsonb
  )
$$;

-- defaultSettingsFor(type) from src/domain/board/column.ts, verbatim.
create or replace function pg_temp.default_settings(t public.column_type)
returns jsonb
language sql
immutable
as $$
  select case t
    when 'STATUS' then
      '{"kind":"status","labels":[{"id":"not_started","name":"Not Started","color":"gray"},{"id":"working","name":"Working On It","color":"orange"},{"id":"waiting","name":"Waiting","color":"sky"},{"id":"stuck","name":"Stuck","color":"red"},{"id":"done","name":"Done","color":"green"}],"doneLabelIds":["done"],"defaultLabelId":"not_started"}'::jsonb
    when 'PRIORITY' then
      '{"kind":"priority","labels":[{"id":"critical","name":"Critical","color":"rose"},{"id":"high","name":"High","color":"orange"},{"id":"medium","name":"Medium","color":"blue"},{"id":"low","name":"Low","color":"gray"}]}'::jsonb
    when 'PERSON' then '{"kind":"person","allowMultiple":true}'::jsonb
    when 'NUMBER' then '{"kind":"number","unit":null,"decimals":0}'::jsonb
    when 'TAGS'   then '{"kind":"tags","options":[]}'::jsonb
    else '{"kind":"none"}'::jsonb
  end
$$;

-- DEFAULT_COLUMN_WIDTHS
create or replace function pg_temp.default_width(t public.column_type)
returns integer
language sql
immutable
as $$
  select case t
    when 'TEXT' then 180  when 'LONG_TEXT' then 240 when 'STATUS' then 150
    when 'PERSON' then 130 when 'DATE' then 130     when 'TIMELINE' then 190
    when 'NUMBER' then 110 when 'PRIORITY' then 130 when 'CHECKBOX' then 90
    when 'LINK' then 170   when 'TAGS' then 180     when 'FILES' then 130
    when 'DEPENDENCY' then 180
  end
$$;

-- -----------------------------------------------------------------------------
-- 0. auth.users  (REQUIRED BEFORE profiles - see note)
--
-- public.profiles.id references auth.users(id). In a real Supabase project
-- create the nine accounts through the Auth API / dashboard (or the block
-- below) using the SAME ids, so that auth.uid() matches the seed data.
-- The handle_new_user() trigger will create bare profile rows; step 1 then
-- fills in titles, departments and timezones.
--
-- Uncomment to create local dev accounts (password: Password123!). Only do
-- this against a local `supabase start` stack - never against production.
-- -----------------------------------------------------------------------------
-- insert into auth.users (
--   instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
--   raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
--   confirmation_token, recovery_token, email_change, email_change_token_new
-- )
-- select
--   '00000000-0000-0000-0000-000000000000', pg_temp.sid('1', n), 'authenticated', 'authenticated',
--   key || '@rmit.local', crypt('Password123!', gen_salt('bf')), now(),
--   '{"provider":"email","providers":["email"]}'::jsonb,
--   jsonb_build_object('first_name', first_name, 'last_name', last_name),
--   now(), now(), '', '', '', ''
-- from (values
--   (1, 'danh',   'Danh',   'Nguyen'),
--   (2, 'emily',  'Emily',  'Carter'),
--   (3, 'jun',    'Jun',    'Tanaka'),
--   (4, 'joanne', 'Joanne', 'Walsh'),
--   (5, 'duc',    'Duc',    'Tran'),
--   (6, 'tuyet',  'Tuyet',  'Le'),
--   (7, 'hil',    'Hil',    'Pham'),
--   (8, 'grace',  'Grace',  'Kim'),
--   (9, 'jane',   'Jane',   'Morrison')
-- ) as u(n, key, first_name, last_name)
-- on conflict (id) do nothing;
--
-- -- Email/password sign-in also needs an identities row per user.
-- insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
-- select gen_random_uuid(), u.id, u.id::text,
--        jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
--        'email', now(), now(), now()
-- from auth.users u
-- where u.id in (select pg_temp.sid('1', n) from generate_series(1, 9) n)
-- on conflict (provider_id, provider) do nothing;

-- -----------------------------------------------------------------------------
-- 1. profiles
-- -----------------------------------------------------------------------------

insert into public.profiles (id, email, first_name, last_name, display_name, job_title, department, timezone)
select pg_temp.sid('1', n), key || '@rmit.local', first_name, last_name,
       first_name || ' ' || last_name, job_title, department, timezone
from (values
  (1, 'danh',   'Danh',   'Nguyen',   'Senior Designer',    'Creative',  'Asia/Ho_Chi_Minh'),
  (2, 'emily',  'Emily',  'Carter',   'Creative Lead',      'Marketing', 'Australia/Melbourne'),
  (3, 'jun',    'Jun',    'Tanaka',   'Digital Producer',   'Digital',   'Australia/Melbourne'),
  (4, 'joanne', 'Joanne', 'Walsh',    'Campaign Manager',   'Marketing', 'Australia/Melbourne'),
  (5, 'duc',    'Duc',    'Tran',     'Motion Designer',    'Creative',  'Asia/Ho_Chi_Minh'),
  (6, 'tuyet',  'Tuyet',  'Le',       'Graphic Designer',   'Creative',  'Asia/Ho_Chi_Minh'),
  (7, 'hil',    'Hil',    'Pham',     'Web Designer',       'Digital',   'Asia/Ho_Chi_Minh'),
  (8, 'grace',  'Grace',  'Kim',      'Content Strategist', 'Content',   'Australia/Melbourne'),
  (9, 'jane',   'Jane',   'Morrison', 'Copywriter',         'Content',   'Australia/Melbourne')
) as u(n, key, first_name, last_name, job_title, department, timezone)
on conflict (id) do update set
  first_name   = excluded.first_name,
  last_name    = excluded.last_name,
  display_name = excluded.display_name,
  job_title    = excluded.job_title,
  department   = excluded.department,
  timezone     = excluded.timezone;

-- -----------------------------------------------------------------------------
-- 2. workspace + members
-- -----------------------------------------------------------------------------

insert into public.workspaces (id, name, slug)
values (pg_temp.sid('0', 1), 'RMIT Creative Team', 'rmit')
on conflict (id) do nothing;

insert into public.workspace_members (workspace_id, user_id, role, status)
select pg_temp.sid('0', 1), pg_temp.sid('1', n), role::public.workspace_role, 'ACTIVE'
from (values
  (1, 'OWNER'), (2, 'ADMIN'), (3, 'MEMBER'), (4, 'ADMIN'), (5, 'MEMBER'),
  (6, 'MEMBER'), (7, 'MEMBER'), (8, 'MEMBER'), (9, 'GUEST')
) as m(n, role)
on conflict (workspace_id, user_id) do nothing;

-- -----------------------------------------------------------------------------
-- 3. teams + members
-- -----------------------------------------------------------------------------

insert into public.teams (id, workspace_id, name, description, color, icon)
select pg_temp.sid('2', n), pg_temp.sid('0', 1), name, description, color, icon
from (values
  (1, 'Vietnam Creative',   'Design and production studio based in Ho Chi Minh City.',            'red',    'palette'),
  (2, 'Melbourne Creative', 'Campaign creative and brand design for the Melbourne campuses.',      'navy',   'paintbrush'),
  (3, 'Campaigns',          'Integrated campaign planning and delivery.',                          'orange', 'megaphone'),
  (4, 'Digital',            'Web, landing pages and digital out-of-home.',                         'cyan',   'monitor'),
  (5, 'Brand',              'Brand governance, guidelines and identity assets.',                   'purple', 'sparkles'),
  (6, 'Content',            'Always-on social and editorial content.',                             'green',  'newspaper')
) as t(n, name, description, color, icon)
on conflict (id) do nothing;

insert into public.team_members (team_id, user_id, role)
select pg_temp.sid('2', team), pg_temp.sid('1', usr), role::public.team_role
from (values
  -- vietnam
  (1, 1, 'LEAD'), (1, 5, 'MEMBER'), (1, 6, 'MEMBER'), (1, 7, 'MEMBER'),
  -- melbourne
  (2, 2, 'LEAD'), (2, 3, 'MEMBER'), (2, 8, 'MEMBER'), (2, 9, 'MEMBER'),
  -- campaigns
  (3, 4, 'LEAD'), (3, 2, 'MEMBER'), (3, 1, 'MEMBER'), (3, 3, 'MEMBER'),
  -- digital
  (4, 3, 'LEAD'), (4, 7, 'MEMBER'), (4, 8, 'MEMBER'),
  -- brand
  (5, 4, 'LEAD'), (5, 2, 'MEMBER'), (5, 5, 'MEMBER'),
  -- content
  (6, 8, 'LEAD'), (6, 9, 'MEMBER'), (6, 6, 'MEMBER')
) as tm(team, usr, role)
on conflict (team_id, user_id) do nothing;

-- -----------------------------------------------------------------------------
-- 4. boards
-- -----------------------------------------------------------------------------

insert into public.boards (id, workspace_id, team_id, name, slug, description, type, visibility, owner_id, color, icon, created_at, updated_at)
select pg_temp.sid('3', n), pg_temp.sid('0', 1), pg_temp.sid('2', team), name, slug, description,
       'MAIN', visibility::public.board_visibility, pg_temp.sid('1', owner), color, icon,
       now() - interval '40 days', now() - interval '1 day'
from (values
  (1, 2, 'Semester 1 Campaign', 'semester-1-campaign', 'Integrated Semester 1 recruitment campaign across Melbourne and Vietnam.',        'WORKSPACE', 2, 'orange', 'megaphone'),
  (2, 1, 'Masterclass Assets',  'masterclass-assets',  'Speaker assets, social tiles and the landing page for the Masterclass series.', 'TEAM',      1, 'violet', 'sparkles'),
  (3, 1, 'RMITinerary 2026',    'rmitinerary-2026',    'Publication production tracking and creative approvals.',                       'WORKSPACE', 1, 'red',    'compass'),
  (4, 1, 'DOOH Production',     'dooh-production',     'Digital out-of-home artwork production and network specifications.',            'TEAM',      5, 'teal',   'monitor'),
  (5, 1, 'Creative Requests',   'creative-requests',   'Incoming requests from across the university, triaged by the Vietnam studio.',  'WORKSPACE', 1, 'blue',   'inbox'),
  (6, 2, 'Always-On Content',   'always-on-content',   'Evergreen social and editorial content calendar.',                              'WORKSPACE', 8, 'green',  'newspaper')
) as b(n, team, name, slug, description, visibility, owner, color, icon)
on conflict (id) do nothing;

-- Owner + owning team (lead and members) as editors, optional viewers.
insert into public.board_members (board_id, user_id, role)
select pg_temp.sid('3', board), pg_temp.sid('1', usr), role::public.board_role
from (values
  -- sem1 (melbourne, owner emily)
  (1, 2, 'OWNER'), (1, 3, 'EDITOR'), (1, 8, 'EDITOR'), (1, 9, 'EDITOR'),
  -- masterclass (vietnam, owner danh; viewers emily, jun)
  (2, 1, 'OWNER'), (2, 5, 'EDITOR'), (2, 6, 'EDITOR'), (2, 7, 'EDITOR'), (2, 2, 'VIEWER'), (2, 3, 'VIEWER'),
  -- rmitinerary (vietnam, owner danh)
  (3, 1, 'OWNER'), (3, 5, 'EDITOR'), (3, 6, 'EDITOR'), (3, 7, 'EDITOR'),
  -- dooh (vietnam, owner duc; viewers jun, joanne)
  (4, 5, 'OWNER'), (4, 1, 'EDITOR'), (4, 6, 'EDITOR'), (4, 7, 'EDITOR'), (4, 3, 'VIEWER'), (4, 4, 'VIEWER'),
  -- requests (vietnam, owner danh)
  (5, 1, 'OWNER'), (5, 5, 'EDITOR'), (5, 6, 'EDITOR'), (5, 7, 'EDITOR'),
  -- alwayson (melbourne, owner grace)
  (6, 8, 'OWNER'), (6, 2, 'EDITOR'), (6, 3, 'EDITOR'), (6, 9, 'EDITOR')
) as bm(board, usr, role)
on conflict (board_id, user_id) do nothing;

-- -----------------------------------------------------------------------------
-- 5. groups  (numbering continues across boards in board order, like the TS seed)
-- -----------------------------------------------------------------------------

insert into public.board_groups (id, board_id, name, color, position, created_at)
select pg_temp.sid('4', n), pg_temp.sid('3', board), name, color, pos, now() - interval '40 days'
from (values
  -- sem1
  (1,  1, 'Planning',           'sky',    0), (2,  1, 'Production',         'orange', 1),
  (3,  1, 'Review',             'violet', 2), (4,  1, 'Live',               'green',  3),
  (5,  1, 'Completed',          'gray',   4),
  -- masterclass
  (6,  2, 'Briefing',           'gray',   0), (7,  2, 'Design',             'violet', 1),
  (8,  2, 'Internal Review',    'sky',    2), (9,  2, 'Stakeholder Review', 'amber',  3),
  (10, 2, 'Approved',           'green',  4), (11, 2, 'Delivered',          'teal',   5),
  -- rmitinerary
  (12, 3, 'Backlog',            'gray',   0), (13, 3, 'Design',             'red',    1),
  (14, 3, 'Production',         'orange', 2), (15, 3, 'Stakeholder Review', 'amber',  3),
  (16, 3, 'Completed',          'green',  4),
  -- dooh
  (17, 4, 'This Fortnight',     'teal',   0), (18, 4, 'In Progress',        'orange', 1),
  (19, 4, 'Internal Review',    'sky',    2), (20, 4, 'Approved',           'green',  3),
  (21, 4, 'Completed',          'gray',   4),
  -- requests
  (22, 5, 'New Requests',       'blue',   0), (23, 5, 'Triaged',            'sky',    1),
  (24, 5, 'In Progress',        'orange', 2), (25, 5, 'Delivered',          'green',  3),
  -- alwayson
  (26, 6, 'Ideas',              'gray',   0), (27, 6, 'This Week',          'green',  1),
  (28, 6, 'Drafting',           'orange', 2), (29, 6, 'Scheduled',          'sky',    3),
  (30, 6, 'Published',          'teal',   4)
) as g(n, board, name, color, pos)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 6. columns  (settings = defaultSettingsFor(type), width = default unless given)
-- -----------------------------------------------------------------------------

insert into public.board_columns (id, board_id, name, type, settings, position, width, created_at)
select pg_temp.sid('5', n), pg_temp.sid('3', board), name, type::public.column_type,
       pg_temp.default_settings(type::public.column_type), pos,
       coalesce(width, pg_temp.default_width(type::public.column_type)),
       now() - interval '40 days'
from (values
  -- sem1
  (1,  1, 'Owner',           'PERSON',     0, null::integer),
  (2,  1, 'Status',          'STATUS',     1, null),
  (3,  1, 'Priority',        'PRIORITY',   2, null),
  (4,  1, 'Timeline',        'TIMELINE',   3, null),
  (5,  1, 'Due Date',        'DATE',       4, null),
  (6,  1, 'Channel',         'TAGS',       5, null),
  -- masterclass
  (7,  2, 'Designer',        'PERSON',     0, null),
  (8,  2, 'Status',          'STATUS',     1, null),
  (9,  2, 'Priority',        'PRIORITY',   2, null),
  (10, 2, 'Due Date',        'DATE',       3, null),
  (11, 2, 'Format',          'TEXT',       4, null),
  (12, 2, 'Market',          'TAGS',       5, null),
  -- rmitinerary
  (13, 3, 'Owner',           'PERSON',     0, null),
  (14, 3, 'Status',          'STATUS',     1, null),
  (15, 3, 'Priority',        'PRIORITY',   2, null),
  (16, 3, 'Due Date',        'DATE',       3, null),
  (17, 3, 'Timeline',        'TIMELINE',   4, null),
  (18, 3, 'Dependency',      'DEPENDENCY', 5, null),
  (19, 3, 'Files',           'FILES',      6, null),
  (20, 3, 'Notes',           'TEXT',       7, 220),
  -- dooh
  (21, 4, 'Owner',           'PERSON',     0, null),
  (22, 4, 'Status',          'STATUS',     1, null),
  (23, 4, 'Priority',        'PRIORITY',   2, null),
  (24, 4, 'Due Date',        'DATE',       3, null),
  (25, 4, 'Format',          'TEXT',       4, null),
  (26, 4, 'Specs confirmed', 'CHECKBOX',   5, null),
  -- requests
  (27, 5, 'Requester',       'PERSON',     0, null),
  (28, 5, 'Owner',           'PERSON',     1, null),
  (29, 5, 'Status',          'STATUS',     2, null),
  (30, 5, 'Priority',        'PRIORITY',   3, null),
  (31, 5, 'Due Date',        'DATE',       4, null),
  (32, 5, 'Brief',           'LINK',       5, null),
  (33, 5, 'Estimate (h)',    'NUMBER',     6, null),
  -- alwayson
  (34, 6, 'Owner',           'PERSON',     0, null),
  (35, 6, 'Status',          'STATUS',     1, null),
  (36, 6, 'Priority',        'PRIORITY',   2, null),
  (37, 6, 'Publish Date',    'DATE',       3, null),
  (38, 6, 'Channel',         'TAGS',       4, null),
  (39, 6, 'Copy',            'LONG_TEXT',  5, null)
) as c(n, board, name, type, pos, width)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 7. items - Semester 1 Campaign (board 1, items 1-15)
-- -----------------------------------------------------------------------------

insert into public.items (id, board_id, group_id, parent_item_id, name, description, position, created_by, created_at, updated_at)
select pg_temp.sid('6', n), pg_temp.sid('3', 1), pg_temp.sid('4', grp), null, name, description, pos,
       pg_temp.sid('1', creator), now() - make_interval(days => days_ago), now() - interval '6 hours'
from (values
  (1,  1, 0, 'Sem 1 campaign storyboard',          'Storyboard for the 30s hero film and 15s social cutdowns. Align with the new brand platform.', 2, 12),
  (2,  1, 1, 'Prepare campaign image selections',  null,                                                                                          4, 10),
  (3,  1, 2, 'Media plan sign-off',                'Blocked pending budget confirmation from the Marketing Director.',                             4, 14),
  (4,  1, 3, 'Campus open day messaging matrix',   null,                                                                                          2, 3),
  (5,  2, 0, 'Sem 1 DOOH adaptation',              'Adapt hero key visual to the Melbourne CBD DOOH network. Portrait and landscape formats.',      3, 5),
  (6,  2, 1, 'Hero film edit v2',                  null,                                                                                          2, 8),
  (7,  2, 2, 'Social cutdowns – 15s x 6',          null,                                                                                          2, 8),
  (8,  2, 3, 'Print ad – The Age full page',       null,                                                                                          4, 4),
  (9,  2, 4, 'Landing page hero animation',        null,                                                                                          3, 6),
  (10, 3, 0, 'Radio script – 30s',                 null,                                                                                          8, 9),
  (11, 3, 1, 'Key visual – stakeholder round 2',   'Second round of feedback from the Deputy Vice-Chancellor''s office.',                          2, 11),
  (12, 4, 0, 'Paid social – phase 1',              null,                                                                                          3, 16),
  (13, 4, 1, 'Search ads copy refresh',            null,                                                                                          8, 15),
  (14, 5, 0, 'Campaign brief and objectives',      null,                                                                                          4, 32),
  (15, 5, 1, 'Creative territory exploration',     null,                                                                                          2, 26)
) as i(n, grp, pos, name, description, creator, days_ago)
on conflict (id) do nothing;

-- Values. Columns: 1 Owner, 2 Status, 3 Priority, 4 Timeline, 5 Due Date, 6 Channel.
with src (n, owners, status, priority, due, tl_start, tl_end, tags) as (
  values
    (1,  array[2, 1], 'working',     'critical', 2,   -6,        2,         array['Video', 'Social']),
    (2,  array[4],    'waiting',     'high',     1,   -3,        1,         array['Photography']),
    (3,  array[4],    'stuck',       'high',     -2,  -9,        -2,        array['Media']),
    (4,  array[8],    'not_started', 'medium',   9,   null::int, null::int, array['Copy']),
    (5,  array[1],    'working',     'high',     0,   -2,        0,         array['DOOH']),
    (6,  array[5],    'working',     'critical', 3,   -4,        3,         array['Video']),
    (7,  array[5, 6], 'not_started', 'medium',   6,   3,         6,         array['Social', 'Video']),
    (8,  array[6],    'working',     'medium',   4,   0,         4,         array['Print']),
    (9,  array[7],    'waiting',     'medium',   5,   -1,        5,         array['Web']),
    (10, array[9],    'waiting',     'low',      1,   null,      null,      array['Radio', 'Copy']),
    (11, array[2],    'working',     'critical', -1,  -5,        -1,        array['Brand']),
    (12, array[3],    'done',        'high',     -4,  -10,       -4,        array['Social', 'Media']),
    (13, array[8],    'done',        'low',      -6,  null,      null,      array['Search', 'Copy']),
    (14, array[4],    'done',        'high',     -20, -30,       -20,       array['Strategy']),
    (15, array[2, 1], 'done',        'high',     -14, -24,       -14,       array['Brand'])
)
insert into public.item_column_values (item_id, column_id, value_json, updated_at)
select pg_temp.sid('6', n), pg_temp.sid('5', 1), jsonb_build_object('type', 'PERSON', 'userIds', pg_temp.user_ids(owners)), now() - interval '1 day' from src
union all
select pg_temp.sid('6', n), pg_temp.sid('5', 2), jsonb_build_object('type', 'STATUS', 'labelId', status), now() - interval '1 day' from src
union all
select pg_temp.sid('6', n), pg_temp.sid('5', 3), jsonb_build_object('type', 'PRIORITY', 'labelId', priority), now() - interval '1 day' from src
union all
select pg_temp.sid('6', n), pg_temp.sid('5', 4), jsonb_build_object('type', 'TIMELINE', 'start', pg_temp.rel_date(tl_start), 'end', pg_temp.rel_date(tl_end)), now() - interval '1 day' from src where tl_start is not null
union all
select pg_temp.sid('6', n), pg_temp.sid('5', 5), jsonb_build_object('type', 'DATE', 'date', pg_temp.rel_date(due)), now() - interval '1 day' from src
union all
select pg_temp.sid('6', n), pg_temp.sid('5', 6), jsonb_build_object('type', 'TAGS', 'tags', to_jsonb(tags)), now() - interval '1 day' from src
on conflict (item_id, column_id) do nothing;

-- -----------------------------------------------------------------------------
-- 8. items - RMITinerary 2026 (board 3, items 27-47; 30-32 and 34-35 are subitems)
-- -----------------------------------------------------------------------------

insert into public.items (id, board_id, group_id, parent_item_id, name, description, position, created_by, created_at, updated_at)
select pg_temp.sid('6', n), pg_temp.sid('3', 3), pg_temp.sid('4', grp),
       case when parent is null then null else pg_temp.sid('6', parent) end,
       name, description, pos, pg_temp.sid('1', creator),
       now() - make_interval(days => days_ago),
       now() - (case when parent is null then interval '6 hours' else interval '8 hours' end)
from (values
  (27, 12, null::int, 0, 'RMITinerary 2027 planning kick-off',      null,                                                                                     4, 2),
  (28, 12, null,      1, 'Accessibility review of PDF export',      null,                                                                                     1, 3),
  (29, 13, null,      0, 'RMITinerary High Achiever',               'Persona spread for the High Achiever pathway. 4pp including map and timeline.',           1, 12),
  (30, 13, 29,        0, 'Persona illustration',                    null,                                                                                     1, 11),
  (31, 13, 29,        1, 'Copy proofread',                          null,                                                                                     1, 11),
  (32, 13, 29,        2, 'Final export',                            null,                                                                                     1, 11),
  (33, 13, null,      1, 'RMITinerary Pragmatist',                  null,                                                                                     1, 11),
  (34, 13, 33,        0, 'Persona illustration',                    null,                                                                                     1, 10),
  (35, 13, 33,        1, 'Copy proofread',                          null,                                                                                     1, 10),
  (36, 13, null,      2, 'RMITinerary Explorer',                    null,                                                                                     1, 11),
  (37, 13, null,      3, 'RMITinerary Independent',                 null,                                                                                     1, 11),
  (38, 13, null,      4, 'Cover concept – final artwork',           'Final cover artwork. Spot UV on the RMIT wordmark; confirm with printer.',                1, 9),
  (39, 14, null,      0, 'Chinese language adaptation',             null,                                                                                     1, 5),
  (40, 14, null,      1, 'Vietnamese language adaptation',          null,                                                                                     1, 5),
  (41, 14, null,      2, 'Upload final production files',           null,                                                                                     1, 5),
  (42, 14, null,      3, 'Printer quote and paper stock',           null,                                                                                     1, 8),
  (43, 15, null,      0, 'Review stakeholder feedback',             'Consolidate feedback from Student Recruitment and the Vietnam Marketing team.',           4, 4),
  (44, 15, null,      1, 'Map illustration – Saigon South campus',  null,                                                                                     1, 10),
  (45, 16, null,      0, 'Content outline and pagination',          null,                                                                                     8, 30),
  (46, 16, null,      1, 'Typography and grid system',              null,                                                                                     1, 24),
  (47, 16, null,      2, 'Photography shortlist',                   null,                                                                                     1, 19)
) as i(n, grp, parent, pos, name, description, creator, days_ago)
on conflict (id) do nothing;

-- Values. Columns: 13 Owner, 14 Status, 15 Priority, 16 Due Date, 17 Timeline,
-- 18 Dependency, 19 Files, 20 Notes.
with src (n, owners, status, priority, due, tl_start, tl_end, notes) as (
  values
    (27, array[1, 4], 'not_started', 'low',      40,  null::int, null::int, null::text),
    (28, array[7],    'not_started', 'medium',   18,  null,      null,      null),
    (29, array[1],    'done',        'high',     4,   -6,        4,         'Approved by Joanne. Final export pending.'),
    (30, array[5],    'done',        'high',     -1,  null,      null,      null),
    (31, array[9],    'done',        'medium',   1,   null,      null,      null),
    (32, array[1],    'working',     'medium',   4,   null,      null,      null),
    (33, array[6],    'working',     'high',     6,   -2,        6,         null),
    (34, array[5],    'working',     'high',     2,   null,      null,      null),
    (35, array[9],    'not_started', 'medium',   5,   null,      null,      null),
    (36, array[1],    'waiting',     'medium',   7,   0,         7,         'Waiting on photography from Hanoi campus.'),
    (37, array[6],    'not_started', 'medium',   11,  5,         11,        null),
    (38, array[1],    'working',     'critical', 3,   -4,        3,         null),
    (39, array[5],    'not_started', 'low',      18,  12,        18,        null),
    (40, array[6],    'not_started', 'medium',   16,  10,        16,        null),
    (41, array[1],    'not_started', 'high',     12,  null,      null,      null),
    (42, array[5],    'waiting',     'medium',   5,   null,      null,      'Two quotes received; waiting on third.'),
    (43, array[4, 1], 'working',     'high',     2,   -1,        2,         null),
    (44, array[5],    'waiting',     'medium',   -1,  -8,        -1,        null),
    (45, array[8],    'done',        'high',     -18, -28,       -18,       null),
    (46, array[1],    'done',        'high',     -15, -22,       -15,       null),
    (47, array[6],    'done',        'medium',   -10, null,      null,      null)
)
insert into public.item_column_values (item_id, column_id, value_json, updated_at)
select pg_temp.sid('6', n), pg_temp.sid('5', 13), jsonb_build_object('type', 'PERSON', 'userIds', pg_temp.user_ids(owners)), now() - interval '1 day' from src
union all
select pg_temp.sid('6', n), pg_temp.sid('5', 14), jsonb_build_object('type', 'STATUS', 'labelId', status), now() - interval '1 day' from src
union all
select pg_temp.sid('6', n), pg_temp.sid('5', 15), jsonb_build_object('type', 'PRIORITY', 'labelId', priority), now() - interval '1 day' from src
union all
select pg_temp.sid('6', n), pg_temp.sid('5', 16), jsonb_build_object('type', 'DATE', 'date', pg_temp.rel_date(due)), now() - interval '1 day' from src
union all
select pg_temp.sid('6', n), pg_temp.sid('5', 17), jsonb_build_object('type', 'TIMELINE', 'start', pg_temp.rel_date(tl_start), 'end', pg_temp.rel_date(tl_end)), now() - interval '1 day' from src where tl_start is not null
union all
select pg_temp.sid('6', n), pg_temp.sid('5', 20), jsonb_build_object('type', 'TEXT', 'text', notes), now() - interval '1 day' from src where notes is not null
on conflict (item_id, column_id) do nothing;

-- Dependencies (second pass, mirrors `dependsOn` in the TS seed).
insert into public.item_column_values (item_id, column_id, value_json, updated_at)
select pg_temp.sid('6', n), pg_temp.sid('5', 18),
       jsonb_build_object('type', 'DEPENDENCY', 'itemIds',
         (select jsonb_agg(pg_temp.sid('6', d) order by ord) from unnest(deps) with ordinality as o(d, ord))),
       now() - interval '1 day'
from (values
  (39, array[29, 33]),  -- Chinese adaptation      <- High Achiever, Pragmatist
  (40, array[29]),      -- Vietnamese adaptation   <- High Achiever
  (41, array[43, 38])   -- Upload production files <- Review stakeholder feedback, Cover concept
) as d(n, deps)
on conflict (item_id, column_id) do nothing;

-- Files attachment on the cover concept (AttachmentMeta shape).
insert into public.item_column_values (item_id, column_id, value_json, updated_at)
values (
  pg_temp.sid('6', 38), pg_temp.sid('5', 19),
  jsonb_build_object(
    'type', 'FILES',
    'files', jsonb_build_array(jsonb_build_object(
      'id',         pg_temp.sid('6', 38)::text || '-file-0',
      'filename',   'RMITinerary_Cover_v3.pdf',
      'size',       2400000,
      'mimeType',   'application/pdf',
      'url',        'local://attachments/RMITinerary_Cover_v3.pdf',
      'uploadedBy', pg_temp.sid('1', 1),
      'uploadedAt', to_char(now() - interval '2 days', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ))
  ),
  now() - interval '1 day'
)
on conflict (item_id, column_id) do nothing;

-- -----------------------------------------------------------------------------
-- 9. comments (only those attached to seeded items)
-- -----------------------------------------------------------------------------

insert into public.comments (id, item_id, author_id, body, mention_user_ids, created_at, updated_at)
select pg_temp.sid('8', n), pg_temp.sid('6', item), pg_temp.sid('1', author), body,
       (select coalesce(array_agg(pg_temp.sid('1', m)), '{}'::uuid[]) from unnest(mentions) m),
       now() - age, now() - age
from (values
  (3, 43, 4, 'Student Recruitment want the High Achiever spread to lead with the scholarship pathway. I''ve added their notes to the shared folder.', array[]::int[], interval '22 hours'),
  (4, 43, 1, 'Thanks @Joanne Walsh. I''ll rework the opening spread tomorrow and push the export.',                                                    array[4],       interval '19 hours'),
  (5, 38, 4, 'Moved the due date out two days so the printer can confirm the spot UV area first.',                                                     array[]::int[], interval '3 hours'),
  (6, 3,  4, 'Budget still not confirmed. Escalating to the Director this afternoon.',                                                                 array[]::int[], interval '1 day'),
  (8, 1,  2, 'Frames 4–7 need to show the Saigon South campus. Let''s review together on Thursday.',                                                    array[]::int[], interval '2 days')
) as c(n, item, author, body, mentions, age)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 10. activities
-- -----------------------------------------------------------------------------

-- ITEM_CREATED for every seeded item (activity n = item n).
insert into public.activities (id, workspace_id, board_id, item_id, actor_id, event_type, metadata, created_at)
select pg_temp.sid('9', (regexp_replace(i.id::text, '^.*-', ''))::int),
       pg_temp.sid('0', 1), i.board_id, i.id, i.created_by, 'ITEM_CREATED',
       jsonb_build_object('itemName', i.name, 'boardName', b.name, 'groupName', g.name),
       i.created_at
from public.items i
join public.boards b on b.id = i.board_id
join public.board_groups g on g.id = i.group_id
where i.board_id in (pg_temp.sid('3', 1), pg_temp.sid('3', 3))
on conflict (id) do nothing;

-- Curated recent history.
insert into public.activities (id, workspace_id, board_id, item_id, actor_id, event_type, metadata, created_at)
select pg_temp.sid('9', n), pg_temp.sid('0', 1), pg_temp.sid('3', board), pg_temp.sid('6', item), pg_temp.sid('1', actor),
       event::public.activity_event_type, metadata, now() - age
from (values
  (101, 3, 29, 1, 'ITEM_COLUMN_VALUE_UPDATED', jsonb_build_object('itemName', 'RMITinerary High Achiever', 'columnName', 'Status', 'columnType', 'STATUS', 'from', 'Working On It', 'to', 'Done'), interval '35 minutes'),
  (102, 1, 5,  3, 'ITEM_COLUMN_VALUE_UPDATED', jsonb_build_object('itemName', 'Sem 1 DOOH adaptation', 'columnName', 'Owner', 'columnType', 'PERSON', 'addedUserIds', jsonb_build_array(pg_temp.sid('1', 1)), 'removedUserIds', '[]'::jsonb), interval '2 hours'),
  (103, 3, 38, 4, 'ITEM_COLUMN_VALUE_UPDATED', jsonb_build_object('itemName', 'Cover concept – final artwork', 'columnName', 'Due Date', 'columnType', 'DATE', 'from', pg_temp.rel_date(1), 'to', pg_temp.rel_date(3)), interval '3 hours'),
  (104, 3, 43, 4, 'ITEM_MOVED',                jsonb_build_object('itemName', 'Review stakeholder feedback', 'fromGroupName', 'Design', 'toGroupName', 'Stakeholder Review'), interval '20 hours'),
  (105, 1, 12, 3, 'ITEM_COLUMN_VALUE_UPDATED', jsonb_build_object('itemName', 'Paid social – phase 1', 'columnName', 'Status', 'columnType', 'STATUS', 'from', 'Working On It', 'to', 'Done'), interval '1 day')
) as a(n, board, item, actor, event, metadata, age)
on conflict (id) do nothing;

-- COMMENT_ADDED for each seeded comment (activity n = 110 + comment n).
insert into public.activities (id, workspace_id, board_id, item_id, actor_id, event_type, metadata, created_at)
select pg_temp.sid('9', 110 + (regexp_replace(c.id::text, '^.*-', ''))::int),
       pg_temp.sid('0', 1), i.board_id, c.item_id, c.author_id, 'COMMENT_ADDED',
       jsonb_build_object('itemName', i.name), c.created_at
from public.comments c
join public.items i on i.id = c.item_id
where c.id in (select pg_temp.sid('8', n) from generate_series(1, 8) n)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 11. notifications
-- -----------------------------------------------------------------------------

insert into public.notifications (id, user_id, type, title, body, entity_type, entity_id, board_id, actor_id, read_at, created_at)
select pg_temp.sid('a', n), pg_temp.sid('1', recipient), type::public.notification_type, title, body, 'ITEM',
       pg_temp.sid('6', item), pg_temp.sid('3', board), pg_temp.sid('1', actor),
       case when read_age is null then null else now() - read_age end, now() - age
from (values
  (2, 1, 'ASSIGNED',         'Jun assigned you to Sem 1 DOOH adaptation',            'Semester 1 Campaign · Production',                                                        5,  1, 3, null::interval,      interval '2 hours'),
  (3, 1, 'DUE_DATE_CHANGED', 'Due date changed for Cover concept – final artwork',    'Joanne moved the due date to ' || pg_temp.rel_date(3),                                    38, 3, 4, null,                interval '3 hours'),
  (4, 1, 'COMMENT',          'Joanne commented on Review stakeholder feedback',       'Student Recruitment want the High Achiever spread to lead with the scholarship pathway.', 43, 3, 4, interval '18 hours', interval '22 hours'),
  (6, 4, 'MENTION',          'Danh mentioned you in Review stakeholder feedback',     'I''ll rework the opening spread tomorrow and push the export.',                           43, 3, 1, null,                interval '19 hours'),
  (8, 2, 'STATUS_CHANGED',   'RMITinerary High Achiever is now Done',                'Danh changed the status from Working On It',                                              29, 3, 1, null,                interval '35 minutes')
) as nt(n, recipient, type, title, body, item, board, actor, read_age, age)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 12. favourites + recent visits
-- -----------------------------------------------------------------------------

insert into public.board_favourites (board_id, user_id, created_at)
select pg_temp.sid('3', board), pg_temp.sid('1', usr), now() - age
from (values
  (1, 1, interval '10 days'),
  (3, 1, interval '9 days'),
  (1, 2, interval '20 days'),
  (6, 8, interval '8 days')
) as f(board, usr, age)
on conflict (board_id, user_id) do nothing;

insert into public.board_visits (user_id, board_id, visited_at)
select pg_temp.sid('1', usr), pg_temp.sid('3', board), now() - age
from (values
  (1, 3, interval '1 hour'),
  (1, 2, interval '5 hours'),
  (1, 5, interval '1 day'),
  (2, 1, interval '2 hours')
) as v(usr, board, age)
on conflict (user_id, board_id) do nothing;

commit;
