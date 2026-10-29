-- =====================================================================
-- Andrum – databasschema
-- Klistra in HELA filen i Supabase → SQL Editor → Run.
-- Filen går att köra flera gånger utan att något förstörs.
-- =====================================================================

create extension if not exists btree_gist;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- System
-- ---------------------------------------------------------------------
create table if not exists app_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

create table if not exists login_tokens (
  token_hash text primary key,
  email      text not null,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Studios (en rad per kund – multi-tenant)
-- ---------------------------------------------------------------------
create table if not exists studios (
  id                     uuid primary key default gen_random_uuid(),
  slug                   text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  name                   text not null,
  email                  text,
  phone                  text,
  address                text,
  org_nr                 text,
  website                text,
  description            text,
  accent_color           text not null default '#5b7a5e',
  logo_url               text,
  timezone               text not null default 'Europe/Stockholm',
  custom_domain          text unique,
  stripe_account_id      text,
  stripe_charges_enabled boolean not null default false,
  platform_fee_percent   numeric(5,2) not null default 0,
  settings               jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now()
);

create table if not exists studio_members (
  studio_id  uuid not null references studios(id) on delete cascade,
  email      text not null,
  role       text not null default 'owner' check (role in ('owner','staff')),
  created_at timestamptz not null default now(),
  primary key (studio_id, email)
);
create index if not exists studio_members_email_idx on studio_members(email);

-- ---------------------------------------------------------------------
-- Tjänster (mallar) – klass (drop-in), kurs, behandling
-- ---------------------------------------------------------------------
create table if not exists services (
  id             uuid primary key default gen_random_uuid(),
  studio_id      uuid not null references studios(id) on delete cascade,
  kind           text not null check (kind in ('class','course','appointment')),
  name           text not null,
  description    text,
  duration_min   int  not null check (duration_min between 5 and 600),
  price_ore      int  not null default 0 check (price_ore >= 0),
  vat_rate       numeric(4,2) not null default 25,
  capacity       int  not null default 1 check (capacity >= 1),
  buffer_min     int  not null default 0 check (buffer_min >= 0),
  sessions_count int  not null default 7 check (sessions_count >= 1),
  color          text,
  active         boolean not null default true,
  sort           int not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists services_studio_idx on services(studio_id);

-- En kurs = en serie tillfällen som bokas och betalas en gång.
create table if not exists series (
  id              uuid primary key default gen_random_uuid(),
  studio_id       uuid not null references studios(id) on delete cascade,
  service_id      uuid references services(id) on delete set null,
  name            text not null,
  description     text,
  price_ore       int  not null default 0 check (price_ore >= 0),
  vat_rate        numeric(4,2) not null default 25,
  capacity        int  not null check (capacity >= 1),
  allow_late_join boolean not null default false,
  status          text not null default 'active' check (status in ('active','cancelled')),
  created_at      timestamptz not null default now()
);
create index if not exists series_studio_idx on series(studio_id);

-- Ett konkret pass i kalendern. Lokalen kan bara ha en sak i taget:
-- två schemalagda pass får aldrig överlappa (inklusive buffert).
create table if not exists sessions (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references studios(id) on delete cascade,
  service_id    uuid references services(id) on delete set null,
  series_id     uuid references series(id) on delete cascade,
  kind          text not null check (kind in ('class','course','appointment','block')),
  title         text not null,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  blocked_until timestamptz not null,
  capacity      int not null default 1 check (capacity >= 1),
  price_ore     int not null default 0 check (price_ore >= 0),
  vat_rate      numeric(4,2) not null default 25,
  status        text not null default 'scheduled' check (status in ('scheduled','cancelled')),
  note          text,
  created_at    timestamptz not null default now(),
  check (ends_at > starts_at),
  check (blocked_until >= ends_at)
);
create index if not exists sessions_studio_time_idx on sessions(studio_id, starts_at);
create index if not exists sessions_series_idx on sessions(series_id);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sessions_no_overlap') then
    alter table sessions add constraint sessions_no_overlap
      exclude using gist (studio_id with =, tstzrange(starts_at, blocked_until) with &&)
      where (status = 'scheduled');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Kunder, bokningar, närvaro
-- ---------------------------------------------------------------------
create table if not exists customers (
  id         uuid primary key default gen_random_uuid(),
  studio_id  uuid not null references studios(id) on delete cascade,
  email      text not null,
  name       text,
  phone      text,
  created_at timestamptz not null default now(),
  unique (studio_id, email)
);

create table if not exists vouchers (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references studios(id) on delete cascade,
  code          text not null,
  kind          text not null default 'credit' check (kind in ('credit','gift')),
  initial_ore   int not null check (initial_ore > 0),
  balance_ore   int not null check (balance_ore >= 0),
  customer_email text,
  expires_at    timestamptz,
  note          text,
  created_at    timestamptz not null default now(),
  unique (studio_id, code)
);

create table if not exists waitlist (
  id               uuid primary key default gen_random_uuid(),
  studio_id        uuid not null references studios(id) on delete cascade,
  session_id       uuid references sessions(id) on delete cascade,
  series_id        uuid references series(id) on delete cascade,
  email            text not null,
  name             text,
  phone            text,
  status           text not null default 'waiting' check (status in ('waiting','offered','claimed','expired','cancelled')),
  token            uuid not null unique default gen_random_uuid(),
  offered_at       timestamptz,
  offer_expires_at timestamptz,
  created_at       timestamptz not null default now(),
  check ((session_id is not null) <> (series_id is not null))
);
create index if not exists waitlist_session_idx on waitlist(session_id);
create index if not exists waitlist_series_idx on waitlist(series_id);

create table if not exists bookings (
  id                    uuid primary key default gen_random_uuid(),
  studio_id             uuid not null references studios(id) on delete cascade,
  customer_id           uuid not null references customers(id) on delete cascade,
  kind                  text not null check (kind in ('class','course','appointment')),
  session_id            uuid references sessions(id) on delete cascade,
  series_id             uuid references series(id) on delete cascade,
  title                 text not null,
  status                text not null default 'pending' check (status in ('pending','confirmed','cancelled','expired')),
  price_ore             int not null default 0,
  voucher_id            uuid references vouchers(id) on delete set null,
  voucher_ore           int not null default 0,
  amount_ore            int not null default 0,
  vat_rate              numeric(4,2) not null default 25,
  paid_ore              int not null default 0,
  refunded_ore          int not null default 0,
  payment_method        text,
  manage_token          uuid not null unique default gen_random_uuid(),
  stripe_checkout_id    text,
  stripe_payment_intent text,
  waitlist_id           uuid references waitlist(id) on delete set null,
  source                text not null default 'online' check (source in ('online','manual')),
  answers               jsonb,
  note                  text,
  expires_at            timestamptz,
  confirmed_at          timestamptz,
  cancelled_at          timestamptz,
  cancelled_by          text,
  created_at            timestamptz not null default now(),
  check ((session_id is not null) <> (series_id is not null))
);
create index if not exists bookings_studio_idx on bookings(studio_id, created_at desc);
create index if not exists bookings_session_idx on bookings(session_id);
create index if not exists bookings_series_idx on bookings(series_id);
create index if not exists bookings_pi_idx on bookings(stripe_payment_intent);
create index if not exists bookings_status_idx on bookings(status, expires_at);

create table if not exists attendances (
  booking_id       uuid not null references bookings(id) on delete cascade,
  session_id       uuid not null references sessions(id) on delete cascade,
  status           text not null default 'booked' check (status in ('booked','checked_in','no_show','cancelled')),
  reminder_sent_at timestamptz,
  primary key (booking_id, session_id)
);
create index if not exists attendances_session_idx on attendances(session_id);

-- ---------------------------------------------------------------------
-- Mail, Stripe-händelser, logg
-- ---------------------------------------------------------------------
create table if not exists email_templates (
  studio_id  uuid not null references studios(id) on delete cascade,
  key        text not null,
  subject    text not null,
  body       text not null,
  updated_at timestamptz not null default now(),
  primary key (studio_id, key)
);

create table if not exists outbox (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid references studios(id) on delete cascade,
  to_email    text not null,
  reply_to    text,
  from_name   text,
  subject     text not null,
  html        text not null,
  text_body   text,
  attachments jsonb,
  send_at     timestamptz not null default now(),
  sent_at     timestamptz,
  attempts    int not null default 0,
  last_error  text,
  dedupe_key  text unique,
  created_at  timestamptz not null default now()
);
create index if not exists outbox_pending_idx on outbox(send_at) where sent_at is null;

create table if not exists stripe_events (
  id          text primary key,
  type        text not null,
  received_at timestamptz not null default now()
);

create table if not exists audit_log (
  id         bigserial primary key,
  studio_id  uuid references studios(id) on delete cascade,
  actor      text,
  action     text not null,
  details    jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_studio_idx on audit_log(studio_id, created_at desc);

-- ---------------------------------------------------------------------
-- Funktioner
-- ---------------------------------------------------------------------

-- Antal upptagna platser per pass (väntande + bekräftade bokningar).
create or replace function session_taken(p_ids uuid[])
returns table(session_id uuid, taken int)
language sql stable as $$
  select a.session_id, count(*)::int
  from attendances a
  join bookings b on b.id = a.booking_id
  where a.session_id = any(p_ids)
    and a.status <> 'cancelled'
    and b.status in ('pending','confirmed')
  group by a.session_id
$$;

create or replace function series_taken(p_ids uuid[])
returns table(series_id uuid, taken int)
language sql stable as $$
  select b.series_id, count(*)::int
  from bookings b
  where b.series_id = any(p_ids)
    and b.status in ('pending','confirmed')
  group by b.series_id
$$;

-- Lediga platser, där aktiva väntelisteerbjudanden räknas som upptagna
-- (utom för den som håller erbjudandet).
create or replace function free_spots(p_session uuid, p_series uuid, p_except_token uuid default null)
returns int
language plpgsql stable as $$
declare
  v_cap int; v_taken int; v_held int;
begin
  if p_session is not null then
    select capacity into v_cap from sessions where id = p_session;
    select count(*) into v_taken from attendances a join bookings b on b.id = a.booking_id
      where a.session_id = p_session and a.status <> 'cancelled' and b.status in ('pending','confirmed');
    select count(*) into v_held from waitlist w
      where w.session_id = p_session and w.status = 'offered' and w.offer_expires_at > now()
        and (p_except_token is null or w.token <> p_except_token);
  else
    select capacity into v_cap from series where id = p_series;
    select count(*) into v_taken from bookings b
      where b.series_id = p_series and b.status in ('pending','confirmed');
    select count(*) into v_held from waitlist w
      where w.series_id = p_series and w.status = 'offered' and w.offer_expires_at > now()
        and (p_except_token is null or w.token <> p_except_token);
  end if;
  return coalesce(v_cap, 0) - coalesce(v_taken, 0) - coalesce(v_held, 0);
end $$;

-- Reserverar en plats atomiskt. Kastar FULL, ALREADY_BOOKED, STARTED,
-- NOT_FOUND eller krock (23P01) för behandlingar.
create or replace function reserve_booking(
  p_studio        uuid,
  p_kind          text,
  p_session       uuid,
  p_series        uuid,
  p_service       uuid,
  p_starts        timestamptz,
  p_email         text,
  p_name          text,
  p_phone         text,
  p_note          text,
  p_answers       jsonb,
  p_waitlist_token uuid,
  p_expires       timestamptz,
  p_source        text
) returns uuid
language plpgsql as $$
declare
  v_customer uuid;
  v_booking  uuid;
  v_session  sessions%rowtype;
  v_series   series%rowtype;
  v_service  services%rowtype;
  v_first    timestamptz;
  v_wait     uuid;
  v_ends     timestamptz;
begin
  insert into customers (studio_id, email, name, phone)
  values (p_studio, lower(trim(p_email)), nullif(trim(p_name), ''), nullif(trim(p_phone), ''))
  on conflict (studio_id, email) do update
    set name  = coalesce(excluded.name, customers.name),
        phone = coalesce(excluded.phone, customers.phone)
  returning id into v_customer;

  if p_waitlist_token is not null then
    select id into v_wait from waitlist
     where token = p_waitlist_token and studio_id = p_studio
       and status = 'offered' and offer_expires_at > now();
  end if;

  if p_kind = 'appointment' then
    select * into v_service from services
     where id = p_service and studio_id = p_studio and kind = 'appointment' and active;
    if not found then raise exception 'NOT_FOUND'; end if;
    if p_starts <= now() then raise exception 'STARTED'; end if;
    v_ends := p_starts + make_interval(mins => v_service.duration_min);
    insert into sessions (studio_id, service_id, kind, title, starts_at, ends_at, blocked_until,
                          capacity, price_ore, vat_rate)
    values (p_studio, v_service.id, 'appointment', v_service.name, p_starts, v_ends,
            v_ends + make_interval(mins => v_service.buffer_min), 1, v_service.price_ore, v_service.vat_rate)
    returning * into v_session;

    insert into bookings (studio_id, customer_id, kind, session_id, title, price_ore, amount_ore,
                          vat_rate, expires_at, source, note, answers)
    values (p_studio, v_customer, 'appointment', v_session.id, v_service.name, v_service.price_ore,
            v_service.price_ore, v_service.vat_rate, p_expires, p_source, p_note, p_answers)
    returning id into v_booking;
    insert into attendances (booking_id, session_id) values (v_booking, v_session.id);

  elsif p_kind = 'class' then
    select * into v_session from sessions
     where id = p_session and studio_id = p_studio and kind = 'class' and status = 'scheduled'
     for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    if v_session.starts_at <= now() then raise exception 'STARTED'; end if;
    if exists (select 1 from attendances a join bookings b on b.id = a.booking_id
                where a.session_id = v_session.id and b.customer_id = v_customer
                  and b.status in ('pending','confirmed') and a.status <> 'cancelled') then
      raise exception 'ALREADY_BOOKED';
    end if;
    if free_spots(v_session.id, null, p_waitlist_token) <= 0 then
      raise exception 'FULL';
    end if;
    insert into bookings (studio_id, customer_id, kind, session_id, title, price_ore, amount_ore,
                          vat_rate, expires_at, source, note, answers, waitlist_id)
    values (p_studio, v_customer, 'class', v_session.id, v_session.title, v_session.price_ore,
            v_session.price_ore, v_session.vat_rate, p_expires, p_source, p_note, p_answers, v_wait)
    returning id into v_booking;
    insert into attendances (booking_id, session_id) values (v_booking, v_session.id);

  elsif p_kind = 'course' then
    select * into v_series from series
     where id = p_series and studio_id = p_studio and status = 'active'
     for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    select min(starts_at) into v_first from sessions where series_id = v_series.id and status = 'scheduled';
    if v_first is null then raise exception 'NOT_FOUND'; end if;
    if v_first <= now() and not v_series.allow_late_join then raise exception 'STARTED'; end if;
    if not exists (select 1 from sessions where series_id = v_series.id and status = 'scheduled' and starts_at > now()) then
      raise exception 'STARTED';
    end if;
    if exists (select 1 from bookings b where b.series_id = v_series.id and b.customer_id = v_customer
                and b.status in ('pending','confirmed')) then
      raise exception 'ALREADY_BOOKED';
    end if;
    if free_spots(null, v_series.id, p_waitlist_token) <= 0 then
      raise exception 'FULL';
    end if;
    insert into bookings (studio_id, customer_id, kind, series_id, title, price_ore, amount_ore,
                          vat_rate, expires_at, source, note, answers, waitlist_id)
    values (p_studio, v_customer, 'course', v_series.id, v_series.name, v_series.price_ore,
            v_series.price_ore, v_series.vat_rate, p_expires, p_source, p_note, p_answers, v_wait)
    returning id into v_booking;
    insert into attendances (booking_id, session_id)
      select v_booking, s.id from sessions s
       where s.series_id = v_series.id and s.status = 'scheduled' and s.starts_at > now();
  else
    raise exception 'NOT_FOUND';
  end if;

  return v_booking;
end $$;

-- Släpper en bokning (utgången eller avbokad). Frigör platsen och
-- avbokar en reserverad behandlingstid.
create or replace function release_booking(p_booking uuid, p_status text, p_by text default null)
returns boolean
language plpgsql as $$
declare
  v bookings%rowtype;
begin
  select * into v from bookings where id = p_booking for update;
  if not found then return false; end if;
  if v.status in ('cancelled','expired') then return false; end if;
  update bookings
     set status = p_status,
         cancelled_at = now(),
         cancelled_by = p_by
   where id = p_booking;
  update attendances set status = 'cancelled' where booking_id = p_booking;
  if v.kind = 'appointment' then
    update sessions set status = 'cancelled' where id = v.session_id;
  end if;
  -- Ett obetalt tillgodo-avdrag lämnas tillbaka direkt.
  if v.status = 'pending' and v.voucher_id is not null and v.voucher_ore > 0 then
    update vouchers set balance_ore = balance_ore + v.voucher_ore where id = v.voucher_id;
  end if;
  return true;
end $$;

-- Drar av tillgodo/presentkort atomiskt. Returnerar avdraget belopp.
create or replace function apply_voucher(p_booking uuid, p_code text)
returns int
language plpgsql as $$
declare
  v_b bookings%rowtype;
  v_v vouchers%rowtype;
  v_amount int;
begin
  select * into v_b from bookings where id = p_booking for update;
  if not found or v_b.status <> 'pending' or v_b.voucher_id is not null then return 0; end if;
  select * into v_v from vouchers
   where studio_id = v_b.studio_id and upper(code) = upper(trim(p_code))
     and balance_ore > 0 and (expires_at is null or expires_at > now())
   for update;
  if not found then raise exception 'VOUCHER_INVALID'; end if;
  v_amount := least(v_v.balance_ore, v_b.price_ore);
  if v_amount <= 0 then return 0; end if;
  update vouchers set balance_ore = balance_ore - v_amount where id = v_v.id;
  update bookings set voucher_id = v_v.id, voucher_ore = v_amount, amount_ore = price_ore - v_amount
   where id = p_booking;
  return v_amount;
end $$;

-- Skapar en kurs med alla tillfällen i en transaktion.
create or replace function create_course(
  p_studio uuid, p_service uuid, p_name text, p_description text,
  p_price_ore int, p_vat numeric, p_capacity int, p_duration_min int, p_buffer_min int,
  p_starts timestamptz[], p_allow_late boolean
) returns uuid
language plpgsql as $$
declare
  v_series uuid;
  v_start  timestamptz;
begin
  insert into series (studio_id, service_id, name, description, price_ore, vat_rate, capacity, allow_late_join)
  values (p_studio, p_service, p_name, p_description, p_price_ore, p_vat, p_capacity, p_allow_late)
  returning id into v_series;
  foreach v_start in array p_starts loop
    insert into sessions (studio_id, service_id, series_id, kind, title, starts_at, ends_at, blocked_until,
                          capacity, price_ore, vat_rate)
    values (p_studio, p_service, v_series, 'course', p_name, v_start,
            v_start + make_interval(mins => p_duration_min),
            v_start + make_interval(mins => p_duration_min + p_buffer_min),
            p_capacity, 0, p_vat);
  end loop;
  return v_series;
end $$;

-- Vilka av de föreslagna tiderna krockar med något i kalendern?
create or replace function find_conflicts(p_studio uuid, p_starts timestamptz[], p_minutes int, p_ignore uuid default null)
returns table(starts_at timestamptz, conflict_title text)
language sql stable as $$
  select t.s, x.title
  from unnest(p_starts) as t(s)
  join lateral (
    select s.title from sessions s
     where s.studio_id = p_studio and s.status = 'scheduled'
       and (p_ignore is null or s.id <> p_ignore)
       and tstzrange(s.starts_at, s.blocked_until) && tstzrange(t.s, t.s + make_interval(mins => p_minutes))
     limit 1
  ) x on true
$$;

-- ---------------------------------------------------------------------
-- Säkerhet: allt nås bara via servern (service role).
-- RLS på utan policys = anonyma nycklar kommer inte åt någonting.
-- ---------------------------------------------------------------------
do $$
declare t text; f text;
begin
  foreach t in array array['app_config','login_tokens','studios','studio_members','services','series',
    'sessions','customers','vouchers','waitlist','bookings','attendances','email_templates','outbox',
    'stripe_events','audit_log'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    for f in
      select p.oid::regprocedure::text from pg_proc p
       where p.pronamespace = 'public'::regnamespace
         and p.proname in ('session_taken','series_taken','free_spots','reserve_booking','release_booking',
                           'apply_voucher','create_course','find_conflicts')
    loop
      execute format('revoke execute on function %s from public, anon, authenticated', f);
      execute format('grant execute on function %s to service_role', f);
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Automatik: var 5:e minut anropas appens /api/cron
-- (påminnelser, väntelista, mailkö, utgångna reservationer).
-- Adressen och nyckeln fylls i automatiskt av appen (Systemsidan).
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    execute 'create extension if not exists pg_net with schema extensions';
    execute 'create extension if not exists pg_cron with schema pg_catalog';
    execute $cron$
      select cron.schedule(
        'andrum-tick',
        '*/5 * * * *',
        $job$
          select net.http_post(
            url := (select value from public.app_config where key = 'cron_url'),
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer ' || (select value from public.app_config where key = 'cron_secret')
            ),
            body := '{}'::jsonb
          )
          where exists (select 1 from public.app_config where key = 'cron_url')
        $job$
      )
    $cron$;
  else
    raise notice 'pg_cron/pg_net saknas – hoppar över schemaläggning (ok lokalt).';
  end if;
end $$;

insert into app_config (key, value) values ('schema_version', '1')
on conflict (key) do update set value = excluded.value, updated_at = now();
