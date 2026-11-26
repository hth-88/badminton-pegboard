-- =============================================================================
-- Migration 001: Club Weekly Schedule & Member Roster Schema (Supabase)
-- =============================================================================
-- Tables:
--   1. public.clubs            (metadata CLB, host_pin_hash, active_rooms, locked_weeks, settings)
--   2. public.club_members     (thành viên CLB, auth_user_id nullable, generated has_pin)
--   3. public.member_schedules (lịch bận theo tuần 'FIXED' hoặc 'YYYY-Www', unique (club_code, week_key, member_id))
--
-- Security Model:
--   - pgcrypto nằm trong schema `extensions` trên Supabase.
--   - Thu hồi toàn bộ quyền bảng của `anon` & `authenticated`, chỉ cấp SELECT trên
--     các cột KHÔNG nhạy cảm (tuyệt đối loại trừ `host_pin_hash` và `pin_hash`).
--   - Mọi thao tác ghi (INSERT/UPDATE/DELETE) & xác thực PIN đi qua RPC `SECURITY DEFINER`
--     có `SET search_path = public, extensions` và gọi tường minh `extensions.crypt` / `extensions.gen_salt`.
--   - Lưu ý cho client (Phase 2+): Khi query `clubs` hoặc `club_members`, luôn liệt kê
--     tường minh danh sách cột không nhạy cảm (KHÔNG dùng `select('*')`).
-- =============================================================================

-- 1. Kích hoạt pgcrypto trong schema extensions (chuẩn Supabase)
create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- 2. Bảng public.clubs
-- -----------------------------------------------------------------------------
create table if not exists public.clubs (
  club_code text primary key
    check (club_code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'),
  name text not null
    check (char_length(btrim(name)) between 1 and 80),
  host_pin_hash text not null,
  active_rooms jsonb not null default '[]'::jsonb
    check (jsonb_typeof(active_rooms) = 'array'),
  locked_weeks jsonb not null default '[]'::jsonb
    check (jsonb_typeof(locked_weeks) = 'array'),
  settings jsonb not null default '{"allowSelfRegister": true, "defaultDurationHours": 2, "minPlayersPerShift": 4, "timezone": "Asia/Ho_Chi_Minh"}'::jsonb
    check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 3. Bảng public.club_members
--    Lưu ý: Ghi chú kín (notes/tags) của Host chỉ lưu cục bộ trên localStorage,
--    KHÔNG đưa lên bảng công khai này.
-- -----------------------------------------------------------------------------
create table if not exists public.club_members (
  id uuid primary key default gen_random_uuid(),
  club_code text not null references public.clubs(club_code) on delete cascade,
  name text not null
    check (char_length(btrim(name)) between 1 and 60),
  gender text not null
    check (gender in ('M', 'F')),
  rank text not null default 'tby'
    check (rank in ('newbie', 'y-', 'y', 'y+', 'tby-', 'tby', 'tby+', 'tb-', 'tb', 'tb+', 'tb++', 'tbk')),
  rank_score numeric(4, 1) not null default 6.0
    check (rank_score >= 0 and rank_score <= 30),
  no_singles boolean not null default false,
  pin_hash text null,
  has_pin boolean generated always as (pin_hash is not null) stored,
  is_active boolean not null default true,
  auth_user_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_club_members_id_club unique (id, club_code)
);

create unique index if not exists idx_club_members_active_name
  on public.club_members (club_code, lower(btrim(name)))
  where is_active = true;

create index if not exists idx_club_members_club_active
  on public.club_members (club_code, is_active);

-- -----------------------------------------------------------------------------
-- 4. Bảng public.member_schedules
--    week_key = 'FIXED' (lịch bận cố định) hoặc 'YYYY-Www' (lịch theo tuần ISO)
--    Mỗi thành viên chỉ có tối đa 1 dòng cho mỗi (club_code, week_key) -> UPSERT an toàn.
-- -----------------------------------------------------------------------------
create table if not exists public.member_schedules (
  id uuid primary key default gen_random_uuid(),
  club_code text not null references public.clubs(club_code) on delete cascade,
  week_key text not null
    check (week_key = 'FIXED' or week_key ~ '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$'),
  member_id uuid not null,
  busy_slots jsonb not null default '[]'::jsonb
    check (jsonb_typeof(busy_slots) = 'array'),
  note text not null default ''
    check (char_length(note) <= 300),
  updated_at timestamptz not null default now(),
  constraint uq_member_schedules_club_week_member unique (club_code, week_key, member_id),
  constraint fk_member_schedules_member_in_club
    foreign key (member_id, club_code)
    references public.club_members(id, club_code)
    on delete cascade
);

create index if not exists idx_member_schedules_club_week
  on public.member_schedules (club_code, week_key);

-- -----------------------------------------------------------------------------
-- 5. Row Level Security (RLS) & Column-Level Privileges
--    Thu hồi quyền SELECT cột host_pin_hash & pin_hash khỏi anon & authenticated.
--    Chặn mọi INSERT/UPDATE/DELETE trực tiếp; bắt buộc ghi qua RPC SECURITY DEFINER.
-- -----------------------------------------------------------------------------
alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
alter table public.member_schedules enable row level security;

-- Thu hồi toàn bộ quyền bảng mặc định
revoke all on table public.clubs from public, anon, authenticated;
revoke all on table public.club_members from public, anon, authenticated;
revoke all on table public.member_schedules from public, anon, authenticated;

-- Chỉ cấp SELECT trên các cột công khai (KHÔNG bao gồm host_pin_hash / pin_hash)
grant select (club_code, name, active_rooms, locked_weeks, settings, created_at, updated_at)
  on table public.clubs to anon, authenticated;

grant select (id, club_code, name, gender, rank, rank_score, no_singles, has_pin, is_active, auth_user_id, created_at, updated_at)
  on table public.club_members to anon, authenticated;

grant select (id, club_code, week_key, member_id, busy_slots, note, updated_at)
  on table public.member_schedules to anon, authenticated;

-- RLS SELECT policies (cho phép đọc theo club_code qua link ?club=)
drop policy if exists "Public read clubs metadata" on public.clubs;
create policy "Public read clubs metadata"
  on public.clubs
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Public read club members" on public.club_members;
create policy "Public read club members"
  on public.club_members
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Public read member schedules" on public.member_schedules;
create policy "Public read member schedules"
  on public.member_schedules
  for select
  to anon, authenticated
  using (true);

-- -----------------------------------------------------------------------------
-- 6. Bật Realtime cho 3 bảng (idempotent)
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'clubs'
    ) then
      execute 'alter publication supabase_realtime add table public.clubs (club_code, name, active_rooms, locked_weeks, settings, created_at, updated_at)';
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'club_members'
    ) then
      -- Loại trừ pin_hash (bảo mật) và has_pin (cột sinh không được phép trong column list của publication PG 15-17)
      execute 'alter publication supabase_realtime add table public.club_members (id, club_code, name, gender, rank, rank_score, no_singles, is_active, auth_user_id, created_at, updated_at)';
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'member_schedules'
    ) then
      execute 'alter publication supabase_realtime add table public.member_schedules';
    end if;
  end if;
end
$$;

-- =============================================================================
-- 7. RPCs SECURITY DEFINER (SET search_path = public, extensions)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 7.1 create_club: Tạo CLB mới với Host PIN được băm bằng bcrypt (pgcrypto)
-- -----------------------------------------------------------------------------
create or replace function public.create_club(
  p_club_code text,
  p_name text,
  p_host_pin text,
  p_settings jsonb default null
)
returns table (
  club_code text,
  name text,
  active_rooms jsonb,
  locked_weeks jsonb,
  settings jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text := upper(btrim(coalesce(p_club_code, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_pin text := btrim(coalesce(p_host_pin, ''));
  v_settings jsonb;
  v_row public.clubs%rowtype;
begin
  if v_code !~ '^[A-Z0-9][A-Z0-9_-]{2,31}$' then
    raise exception 'INVALID_CLUB_CODE';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception 'INVALID_CLUB_NAME';
  end if;
  if char_length(v_pin) < 4 or char_length(v_pin) > 32 then
    raise exception 'INVALID_HOST_PIN_FORMAT';
  end if;
  if p_settings is not null and jsonb_typeof(p_settings) <> 'object' then
    raise exception 'INVALID_SETTINGS';
  end if;

  v_settings := jsonb_build_object(
    'allowSelfRegister', true,
    'defaultDurationHours', 2,
    'minPlayersPerShift', 4,
    'timezone', 'Asia/Ho_Chi_Minh'
  ) || coalesce(p_settings, '{}'::jsonb);

  begin
    insert into public.clubs (club_code, name, host_pin_hash, settings)
    values (
      v_code,
      v_name,
      extensions.crypt(v_pin, extensions.gen_salt('bf', 8)),
      v_settings
    )
    returning * into v_row;
  exception
    when unique_violation then
      raise exception 'CLUB_ALREADY_EXISTS';
  end;

  return query
  select
    v_row.club_code,
    v_row.name,
    v_row.active_rooms,
    v_row.locked_weeks,
    v_row.settings,
    v_row.created_at,
    v_row.updated_at;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7.2 verify_club_host_pin: Xác thực Host PIN phía server
-- -----------------------------------------------------------------------------
create or replace function public.verify_club_host_pin(
  p_club_code text,
  p_host_pin text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text := upper(btrim(coalesce(p_club_code, '')));
  v_pin text := btrim(coalesce(p_host_pin, ''));
  v_hash text;
begin
  if v_code = '' or v_pin = '' then
    return false;
  end if;

  select c.host_pin_hash
  into v_hash
  from public.clubs c
  where c.club_code = v_code;

  if v_hash is null then
    return false;
  end if;

  return v_hash = extensions.crypt(v_pin, v_hash);
end;
$$;

-- -----------------------------------------------------------------------------
-- 7.3 update_club_settings: Host cập nhật tên, cấu hình CLB hoặc đổi Host PIN
-- -----------------------------------------------------------------------------
create or replace function public.update_club_settings(
  p_club_code text,
  p_host_pin text,
  p_name text default null,
  p_settings jsonb default null,
  p_new_host_pin text default null
)
returns table (
  club_code text,
  name text,
  active_rooms jsonb,
  locked_weeks jsonb,
  settings jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text := upper(btrim(coalesce(p_club_code, '')));
  v_club public.clubs%rowtype;
  v_next_name text;
  v_next_settings jsonb;
  v_next_hash text;
  v_new_pin text;
begin
  select * into v_club
  from public.clubs c
  where c.club_code = v_code;

  if not found then
    raise exception 'CLUB_NOT_FOUND';
  end if;

  if coalesce(btrim(p_host_pin), '') = ''
     or v_club.host_pin_hash <> extensions.crypt(btrim(p_host_pin), v_club.host_pin_hash) then
    raise exception 'INVALID_HOST_PIN';
  end if;

  if p_name is not null then
    v_next_name := btrim(p_name);
    if char_length(v_next_name) < 1 or char_length(v_next_name) > 80 then
      raise exception 'INVALID_CLUB_NAME';
    end if;
  else
    v_next_name := v_club.name;
  end if;

  if p_settings is not null then
    if jsonb_typeof(p_settings) <> 'object' then
      raise exception 'INVALID_SETTINGS';
    end if;
    v_next_settings := v_club.settings || p_settings;
  else
    v_next_settings := v_club.settings;
  end if;

  if p_new_host_pin is not null then
    v_new_pin := btrim(p_new_host_pin);
    if char_length(v_new_pin) < 4 or char_length(v_new_pin) > 32 then
      raise exception 'INVALID_HOST_PIN_FORMAT';
    end if;
    v_next_hash := extensions.crypt(v_new_pin, extensions.gen_salt('bf', 8));
  else
    v_next_hash := v_club.host_pin_hash;
  end if;

  update public.clubs c
  set
    name = v_next_name,
    settings = v_next_settings,
    host_pin_hash = v_next_hash,
    updated_at = now()
  where c.club_code = v_code
  returning * into v_club;

  return query
  select
    v_club.club_code,
    v_club.name,
    v_club.active_rooms,
    v_club.locked_weeks,
    v_club.settings,
    v_club.created_at,
    v_club.updated_at;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7.4 set_club_week_lock: Host khóa / mở khóa báo lịch của một tuần
-- -----------------------------------------------------------------------------
create or replace function public.set_club_week_lock(
  p_club_code text,
  p_host_pin text,
  p_week_key text,
  p_locked boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text := upper(btrim(coalesce(p_club_code, '')));
  v_week text := btrim(coalesce(p_week_key, ''));
  v_club public.clubs%rowtype;
  v_next_locked jsonb;
begin
  if v_week <> 'FIXED' and v_week !~ '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$' then
    raise exception 'INVALID_WEEK_KEY';
  end if;

  select * into v_club
  from public.clubs c
  where c.club_code = v_code;

  if not found then
    raise exception 'CLUB_NOT_FOUND';
  end if;

  if coalesce(btrim(p_host_pin), '') = ''
     or v_club.host_pin_hash <> extensions.crypt(btrim(p_host_pin), v_club.host_pin_hash) then
    raise exception 'INVALID_HOST_PIN';
  end if;

  if coalesce(p_locked, false) then
    select coalesce(jsonb_agg(elem order by elem), '[]'::jsonb)
    into v_next_locked
    from (
      select distinct elem
      from (
        select jsonb_array_elements_text(
          case when jsonb_typeof(v_club.locked_weeks) = 'array' then v_club.locked_weeks else '[]'::jsonb end
        ) as elem
        union all
        select v_week
      ) s
    ) d;
  else
    select coalesce(jsonb_agg(elem order by elem), '[]'::jsonb)
    into v_next_locked
    from jsonb_array_elements_text(
      case when jsonb_typeof(v_club.locked_weeks) = 'array' then v_club.locked_weeks else '[]'::jsonb end
    ) as elem
    where elem <> v_week;
  end if;

  update public.clubs c
  set locked_weeks = v_next_locked, updated_at = now()
  where c.club_code = v_code;

  return v_next_locked;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7.5 upsert_club_active_room & remove_club_active_room: Host gắn/gỡ phòng sân
-- -----------------------------------------------------------------------------
create or replace function public.upsert_club_active_room(
  p_club_code text,
  p_host_pin text,
  p_room jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text := upper(btrim(coalesce(p_club_code, '')));
  v_club public.clubs%rowtype;
  v_room_code text;
  v_next_rooms jsonb;
begin
  if p_room is null or jsonb_typeof(p_room) <> 'object' then
    raise exception 'INVALID_ROOM_PAYLOAD';
  end if;

  v_room_code := upper(btrim(coalesce(p_room->>'roomCode', '')));
  if v_room_code = '' then
    raise exception 'INVALID_ROOM_CODE';
  end if;

  select * into v_club
  from public.clubs c
  where c.club_code = v_code;

  if not found then
    raise exception 'CLUB_NOT_FOUND';
  end if;

  if coalesce(btrim(p_host_pin), '') = ''
     or v_club.host_pin_hash <> extensions.crypt(btrim(p_host_pin), v_club.host_pin_hash) then
    raise exception 'INVALID_HOST_PIN';
  end if;

  select coalesce(jsonb_agg(elem), '[]'::jsonb)
  into v_next_rooms
  from jsonb_array_elements(
    case when jsonb_typeof(v_club.active_rooms) = 'array' then v_club.active_rooms else '[]'::jsonb end
  ) as elem
  where upper(btrim(coalesce(elem->>'roomCode', ''))) <> v_room_code;

  v_next_rooms := v_next_rooms || jsonb_build_array(
    jsonb_build_object(
      'label', coalesce(nullif(btrim(p_room->>'label'), ''), v_room_code),
      'createdAt', coalesce(nullif(btrim(p_room->>'createdAt'), ''), to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
    ) || p_room || jsonb_build_object('roomCode', v_room_code)
  );

  update public.clubs c
  set active_rooms = v_next_rooms, updated_at = now()
  where c.club_code = v_code;

  return v_next_rooms;
end;
$$;

create or replace function public.remove_club_active_room(
  p_club_code text,
  p_host_pin text,
  p_room_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text := upper(btrim(coalesce(p_club_code, '')));
  v_room_code text := upper(btrim(coalesce(p_room_code, '')));
  v_club public.clubs%rowtype;
  v_next_rooms jsonb;
begin
  select * into v_club
  from public.clubs c
  where c.club_code = v_code;

  if not found then
    raise exception 'CLUB_NOT_FOUND';
  end if;

  if coalesce(btrim(p_host_pin), '') = ''
     or v_club.host_pin_hash <> extensions.crypt(btrim(p_host_pin), v_club.host_pin_hash) then
    raise exception 'INVALID_HOST_PIN';
  end if;

  select coalesce(jsonb_agg(elem), '[]'::jsonb)
  into v_next_rooms
  from jsonb_array_elements(
    case when jsonb_typeof(v_club.active_rooms) = 'array' then v_club.active_rooms else '[]'::jsonb end
  ) as elem
  where upper(btrim(coalesce(elem->>'roomCode', ''))) <> v_room_code;

  update public.clubs c
  set active_rooms = v_next_rooms, updated_at = now()
  where c.club_code = v_code;

  return v_next_rooms;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7.6 register_club_member: Thành viên tự thêm tên (khi allowSelfRegister = true)
--     hoặc Host thêm thành viên mới (với p_host_pin hợp lệ)
-- -----------------------------------------------------------------------------
create or replace function public.register_club_member(
  p_club_code text,
  p_name text,
  p_gender text,
  p_rank text default 'tby',
  p_rank_score numeric default 6.0,
  p_no_singles boolean default false,
  p_member_pin text default null,
  p_host_pin text default null
)
returns table (
  id uuid,
  club_code text,
  name text,
  gender text,
  rank text,
  rank_score numeric,
  no_singles boolean,
  has_pin boolean,
  is_active boolean,
  auth_user_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text := upper(btrim(coalesce(p_club_code, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_gender text := upper(btrim(coalesce(p_gender, '')));
  v_rank text := lower(btrim(coalesce(p_rank, 'tby')));
  v_rank_score numeric(4, 1) := coalesce(p_rank_score, 6.0);
  v_member_pin text := btrim(coalesce(p_member_pin, ''));
  v_club public.clubs%rowtype;
  v_is_host boolean := false;
  v_allow_self boolean := true;
  v_pin_hash text := null;
  v_row public.club_members%rowtype;
begin
  select * into v_club
  from public.clubs c
  where c.club_code = v_code;

  if not found then
    raise exception 'CLUB_NOT_FOUND';
  end if;

  if coalesce(btrim(p_host_pin), '') <> '' then
    if v_club.host_pin_hash <> extensions.crypt(btrim(p_host_pin), v_club.host_pin_hash) then
      raise exception 'INVALID_HOST_PIN';
    end if;
    v_is_host := true;
  end if;

  v_allow_self := case
    when jsonb_typeof(v_club.settings->'allowSelfRegister') = 'boolean'
      then (v_club.settings->>'allowSelfRegister')::boolean
    else true
  end;
  if not v_is_host and not v_allow_self then
    raise exception 'SELF_REGISTER_DISABLED';
  end if;

  if char_length(v_name) < 1 or char_length(v_name) > 60 then
    raise exception 'INVALID_MEMBER_NAME';
  end if;

  if v_gender not in ('M', 'F') then
    raise exception 'INVALID_GENDER';
  end if;

  if v_rank not in ('newbie', 'y-', 'y', 'y+', 'tby-', 'tby', 'tby+', 'tb-', 'tb', 'tb+', 'tb++', 'tbk') then
    raise exception 'INVALID_RANK';
  end if;

  if v_rank_score < 0 or v_rank_score > 30 then
    raise exception 'INVALID_RANK_SCORE';
  end if;

  if v_member_pin <> '' then
    if char_length(v_member_pin) < 4 or char_length(v_member_pin) > 32 then
      raise exception 'INVALID_MEMBER_PIN_FORMAT';
    end if;
    v_pin_hash := extensions.crypt(v_member_pin, extensions.gen_salt('bf', 8));
  end if;

  begin
    insert into public.club_members (
      club_code, name, gender, rank, rank_score, no_singles, pin_hash
    )
    values (
      v_code,
      v_name,
      v_gender,
      v_rank,
      v_rank_score,
      coalesce(p_no_singles, false),
      v_pin_hash
    )
    returning * into v_row;
  exception
    when unique_violation then
      raise exception 'MEMBER_NAME_ALREADY_EXISTS';
  end;

  return query
  select
    v_row.id,
    v_row.club_code,
    v_row.name,
    v_row.gender,
    v_row.rank,
    v_row.rank_score,
    v_row.no_singles,
    v_row.has_pin,
    v_row.is_active,
    v_row.auth_user_id,
    v_row.created_at,
    v_row.updated_at;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7.7 update_club_member_by_host: Chỉ Host được sửa trình độ, giới tính, trạng thái
-- -----------------------------------------------------------------------------
create or replace function public.update_club_member_by_host(
  p_club_code text,
  p_host_pin text,
  p_member_id uuid,
  p_name text default null,
  p_gender text default null,
  p_rank text default null,
  p_rank_score numeric default null,
  p_no_singles boolean default null,
  p_is_active boolean default null
)
returns table (
  id uuid,
  club_code text,
  name text,
  gender text,
  rank text,
  rank_score numeric,
  no_singles boolean,
  has_pin boolean,
  is_active boolean,
  auth_user_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text := upper(btrim(coalesce(p_club_code, '')));
  v_club public.clubs%rowtype;
  v_member public.club_members%rowtype;
begin
  select * into v_club
  from public.clubs c
  where c.club_code = v_code;

  if not found then
    raise exception 'CLUB_NOT_FOUND';
  end if;

  if coalesce(btrim(p_host_pin), '') = ''
     or v_club.host_pin_hash <> extensions.crypt(btrim(p_host_pin), v_club.host_pin_hash) then
    raise exception 'INVALID_HOST_PIN';
  end if;

  if p_name is not null and (char_length(btrim(p_name)) < 1 or char_length(btrim(p_name)) > 60) then
    raise exception 'INVALID_MEMBER_NAME';
  end if;

  if p_gender is not null and upper(btrim(p_gender)) not in ('M', 'F') then
    raise exception 'INVALID_GENDER';
  end if;

  if p_rank is not null
     and lower(btrim(p_rank)) not in ('newbie', 'y-', 'y', 'y+', 'tby-', 'tby', 'tby+', 'tb-', 'tb', 'tb+', 'tb++', 'tbk') then
    raise exception 'INVALID_RANK';
  end if;

  if p_rank_score is not null and (p_rank_score < 0 or p_rank_score > 30) then
    raise exception 'INVALID_RANK_SCORE';
  end if;

  begin
    update public.club_members m
    set
      name = case when p_name is not null then btrim(p_name) else m.name end,
      gender = case when p_gender is not null then upper(btrim(p_gender)) else m.gender end,
      rank = case when p_rank is not null then lower(btrim(p_rank)) else m.rank end,
      rank_score = coalesce(p_rank_score, m.rank_score),
      no_singles = coalesce(p_no_singles, m.no_singles),
      is_active = coalesce(p_is_active, m.is_active),
      updated_at = now()
    where m.id = p_member_id and m.club_code = v_code
    returning * into v_member;
  exception
    when unique_violation then
      raise exception 'MEMBER_NAME_ALREADY_EXISTS';
  end;

  if not found then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  return query
  select
    v_member.id,
    v_member.club_code,
    v_member.name,
    v_member.gender,
    v_member.rank,
    v_member.rank_score,
    v_member.no_singles,
    v_member.has_pin,
    v_member.is_active,
    v_member.auth_user_id,
    v_member.created_at,
    v_member.updated_at;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7.8 delete_club_member_by_host: Host ẩn (soft delete) hoặc xóa hẳn thành viên
-- -----------------------------------------------------------------------------
create or replace function public.delete_club_member_by_host(
  p_club_code text,
  p_host_pin text,
  p_member_id uuid,
  p_hard_delete boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text := upper(btrim(coalesce(p_club_code, '')));
  v_club public.clubs%rowtype;
  v_affected int := 0;
begin
  select * into v_club
  from public.clubs c
  where c.club_code = v_code;

  if not found then
    raise exception 'CLUB_NOT_FOUND';
  end if;

  if coalesce(btrim(p_host_pin), '') = ''
     or v_club.host_pin_hash <> extensions.crypt(btrim(p_host_pin), v_club.host_pin_hash) then
    raise exception 'INVALID_HOST_PIN';
  end if;

  if coalesce(p_hard_delete, false) then
    delete from public.club_members m
    where m.id = p_member_id and m.club_code = v_code;
    get diagnostics v_affected = row_count;
  else
    update public.club_members m
    set is_active = false, updated_at = now()
    where m.id = p_member_id and m.club_code = v_code;
    get diagnostics v_affected = row_count;
  end if;

  return v_affected > 0;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7.9 set_member_pin & verify_member_pin: Đặt/đổi PIN cá nhân & Host reset PIN hộ
-- -----------------------------------------------------------------------------
create or replace function public.set_member_pin(
  p_club_code text,
  p_member_id uuid,
  p_new_pin text default null,
  p_current_pin text default null,
  p_host_pin text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text := upper(btrim(coalesce(p_club_code, '')));
  v_new_pin text := btrim(coalesce(p_new_pin, ''));
  v_club public.clubs%rowtype;
  v_member public.club_members%rowtype;
  v_is_host boolean := false;
  v_next_hash text;
begin
  select * into v_club
  from public.clubs c
  where c.club_code = v_code;

  if not found then
    raise exception 'CLUB_NOT_FOUND';
  end if;

  select * into v_member
  from public.club_members m
  where m.id = p_member_id and m.club_code = v_code;

  if not found then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  if coalesce(btrim(p_host_pin), '') <> '' then
    if v_club.host_pin_hash <> extensions.crypt(btrim(p_host_pin), v_club.host_pin_hash) then
      raise exception 'INVALID_HOST_PIN';
    end if;
    v_is_host := true;
  end if;

  if not v_is_host then
    if not v_member.is_active then
      raise exception 'MEMBER_INACTIVE';
    end if;

    -- Thành viên tự đặt/đổi PIN bắt buộc phải nhập PIN mới hợp lệ (không tự xóa trống nếu không phải Host)
    if char_length(v_new_pin) < 4 or char_length(v_new_pin) > 32 then
      raise exception 'INVALID_MEMBER_PIN_FORMAT';
    end if;

    -- Nếu đã có PIN thì bắt buộc xác thực PIN cũ
    if v_member.pin_hash is not null then
      if coalesce(btrim(p_current_pin), '') = ''
         or v_member.pin_hash <> extensions.crypt(btrim(p_current_pin), v_member.pin_hash) then
        raise exception 'INVALID_MEMBER_PIN';
      end if;
    end if;
  else
    -- Host có thể reset về NULL (xóa PIN) hoặc đặt PIN mới hợp lệ
    if v_new_pin <> '' and (char_length(v_new_pin) < 4 or char_length(v_new_pin) > 32) then
      raise exception 'INVALID_MEMBER_PIN_FORMAT';
    end if;
  end if;

  if v_new_pin = '' then
    v_next_hash := null;
  else
    v_next_hash := extensions.crypt(v_new_pin, extensions.gen_salt('bf', 8));
  end if;

  update public.club_members m
  set pin_hash = v_next_hash, updated_at = now()
  where m.id = p_member_id and m.club_code = v_code;

  return true;
end;
$$;

create or replace function public.verify_member_pin(
  p_club_code text,
  p_member_id uuid,
  p_pin text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text := upper(btrim(coalesce(p_club_code, '')));
  v_pin text := btrim(coalesce(p_pin, ''));
  v_hash text;
begin
  if v_code = '' or v_pin = '' or p_member_id is null then
    return false;
  end if;

  select m.pin_hash
  into v_hash
  from public.club_members m
  where m.id = p_member_id and m.club_code = v_code and m.is_active = true;

  if v_hash is null then
    return false;
  end if;

  return v_hash = extensions.crypt(v_pin, v_hash);
end;
$$;

-- -----------------------------------------------------------------------------
-- 7.10 upsert_member_schedule: Lưu lịch bận cá nhân (kiểm tra khóa tuần + PIN trên server)
-- -----------------------------------------------------------------------------
create or replace function public.upsert_member_schedule(
  p_club_code text,
  p_week_key text,
  p_member_id uuid,
  p_busy_slots jsonb,
  p_note text default '',
  p_member_pin text default null,
  p_host_pin text default null
)
returns table (
  id uuid,
  club_code text,
  week_key text,
  member_id uuid,
  busy_slots jsonb,
  note text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text := upper(btrim(coalesce(p_club_code, '')));
  v_week text := btrim(coalesce(p_week_key, ''));
  v_note text := left(btrim(coalesce(p_note, '')), 300);
  v_club public.clubs%rowtype;
  v_member public.club_members%rowtype;
  v_is_host boolean := false;
  v_clean_slots jsonb;
  v_row public.member_schedules%rowtype;
begin
  if v_week <> 'FIXED' and v_week !~ '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$' then
    raise exception 'INVALID_WEEK_KEY';
  end if;

  if p_busy_slots is null
     or jsonb_typeof(p_busy_slots) <> 'array'
     or jsonb_array_length(p_busy_slots) > 119 then
    raise exception 'INVALID_BUSY_SLOTS';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_busy_slots) as elem
    where jsonb_typeof(elem) <> 'string'
       or (elem #>> '{}') !~ '^[0-6]-(7|8|9|1[0-9]|2[0-3])$'
  ) then
    raise exception 'INVALID_BUSY_SLOTS';
  end if;

  select coalesce(jsonb_agg(distinct slot_key order by slot_key), '[]'::jsonb)
  into v_clean_slots
  from jsonb_array_elements_text(p_busy_slots) as slot_key;

  select * into v_club
  from public.clubs c
  where c.club_code = v_code;

  if not found then
    raise exception 'CLUB_NOT_FOUND';
  end if;

  select * into v_member
  from public.club_members m
  where m.id = p_member_id and m.club_code = v_code;

  if not found then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  if not v_member.is_active then
    raise exception 'MEMBER_INACTIVE';
  end if;

  if coalesce(btrim(p_host_pin), '') <> '' then
    if v_club.host_pin_hash <> extensions.crypt(btrim(p_host_pin), v_club.host_pin_hash) then
      raise exception 'INVALID_HOST_PIN';
    end if;
    v_is_host := true;
  end if;

  -- Kiểm tra khóa tuần phía server (chỉ Host được ghi đè khi tuần đã khóa)
  if not v_is_host
     and jsonb_typeof(v_club.locked_weeks) = 'array'
     and v_club.locked_weeks ? v_week then
    raise exception 'WEEK_LOCKED';
  end if;

  -- Kiểm tra PIN cá nhân phía server (nếu thành viên đã đặt PIN và người gọi không phải Host)
  if not v_is_host and v_member.pin_hash is not null then
    if coalesce(btrim(p_member_pin), '') = ''
       or v_member.pin_hash <> extensions.crypt(btrim(p_member_pin), v_member.pin_hash) then
      raise exception 'INVALID_MEMBER_PIN';
    end if;
  end if;

  insert into public.member_schedules (club_code, week_key, member_id, busy_slots, note, updated_at)
  values (v_code, v_week, p_member_id, v_clean_slots, v_note, now())
  on conflict on constraint uq_member_schedules_club_week_member
  do update set
    busy_slots = excluded.busy_slots,
    note = excluded.note,
    updated_at = now()
  returning * into v_row;

  return query
  select
    v_row.id,
    v_row.club_code,
    v_row.week_key,
    v_row.member_id,
    v_row.busy_slots,
    v_row.note,
    v_row.updated_at;
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. Cấp quyền EXECUTE các RPC cho anon & authenticated (thu hồi từ PUBLIC)
-- -----------------------------------------------------------------------------
revoke all on function public.create_club(text, text, text, jsonb) from public;
grant execute on function public.create_club(text, text, text, jsonb) to anon, authenticated;

revoke all on function public.verify_club_host_pin(text, text) from public;
grant execute on function public.verify_club_host_pin(text, text) to anon, authenticated;

revoke all on function public.update_club_settings(text, text, text, jsonb, text) from public;
grant execute on function public.update_club_settings(text, text, text, jsonb, text) to anon, authenticated;

revoke all on function public.set_club_week_lock(text, text, text, boolean) from public;
grant execute on function public.set_club_week_lock(text, text, text, boolean) to anon, authenticated;

revoke all on function public.upsert_club_active_room(text, text, jsonb) from public;
grant execute on function public.upsert_club_active_room(text, text, jsonb) to anon, authenticated;

revoke all on function public.remove_club_active_room(text, text, text) from public;
grant execute on function public.remove_club_active_room(text, text, text) to anon, authenticated;

revoke all on function public.register_club_member(text, text, text, text, numeric, boolean, text, text) from public;
grant execute on function public.register_club_member(text, text, text, text, numeric, boolean, text, text) to anon, authenticated;

revoke all on function public.update_club_member_by_host(text, text, uuid, text, text, text, numeric, boolean, boolean) from public;
grant execute on function public.update_club_member_by_host(text, text, uuid, text, text, text, numeric, boolean, boolean) to anon, authenticated;

revoke all on function public.delete_club_member_by_host(text, text, uuid, boolean) from public;
grant execute on function public.delete_club_member_by_host(text, text, uuid, boolean) to anon, authenticated;

revoke all on function public.set_member_pin(text, uuid, text, text, text) from public;
grant execute on function public.set_member_pin(text, uuid, text, text, text) to anon, authenticated;

revoke all on function public.verify_member_pin(text, uuid, text) from public;
grant execute on function public.verify_member_pin(text, uuid, text) to anon, authenticated;

revoke all on function public.upsert_member_schedule(text, text, uuid, jsonb, text, text, text) from public;
grant execute on function public.upsert_member_schedule(text, text, uuid, jsonb, text, text, text) to anon, authenticated;
