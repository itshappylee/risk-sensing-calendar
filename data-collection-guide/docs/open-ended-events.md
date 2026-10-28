# Ongoing events (no end date)

> Applied 2026-10-29. Lives entirely in Supabase; the web app adds the admin section.

**In short**
1. An item with a start date but **no end date** is "ongoing" from the day it is collected or
   reported. Its end date is set to today and **extended to today every hour**.
2. The admin screen section **"Ongoing — no end date"** has **End today** / **Pick end date**.
   Pressing it stops the extension and fixes the end date everywhere, including rows already on
   the calendar.
3. A PC using the same Supabase project only needs the latest web-app code (section 3A).

---

## 1. Behaviour

| Case | Before | Now |
|---|---|---|
| End date empty | calendar showed the start day only | **ongoing**: end = today, grows daily |
| Admin leaves the end date blank | saved as one day | saved as **ongoing** |
| Single-day event | end could be blank | **enter the same date as start** |
| Event is over | no way to fix promoted items | **End** button in the admin screen |
| Who extends | — | Supabase `pg_cron`, runs even when every PC is off |

Applies to collected and manually reported items, pending and approved alike.

## 2. Flow

```
[candidate saved]  start date set, end date empty
     │  trigger candidate_open_ended
     ▼
open_ended = true, end = today        ──► shown at once under "Ongoing" in the admin screen
     │
     │  every hour at :05 UTC — pg_cron job extend-open-ended
     ▼
end = today  (candidate + strikes_manual + raw_intake + events)
     │
     │  admin presses End today / Pick end date
     ▼
end_open_ended(id, date) → open_ended = false, end fixed everywhere
```

- **Trigger** — on insert, or when `date_start`/`date_end` change on `risk_candidates`:
  start set and end empty → `open_ended = true`, `date_end = max(start, today)`.
  A person typing an explicit end date → `open_ended = false`.
  "Today" = Europe/Bratislava.
- **Hourly extension** — candidates with `open_ended`, decision `pending` or `approved`,
  start ≤ today, end < today. Downstream rows are matched by **country + start date + source URL**
  (for `source_url = 'manual'` also by event name) in `strikes_manual`, `raw_intake`, `events`.
  Idempotent. Future start dates wait until they start.
- **End button** — signed-in users only; end ≥ start; an already-ended item is rejected.

### Database objects

| Name | Type | Role |
|---|---|---|
| `risk_candidates.open_ended` | column (boolean) | ongoing flag |
| `local_today()` | function | today in Europe/Bratislava |
| `candidate_open_ended` | trigger | empty end → ongoing + today |
| `_set_candidate_end()` | internal function | updates downstream rows |
| `extend_open_ended()` | function | hourly extension |
| `end_open_ended(p_id, p_end)` | RPC | admin End button |
| `extend-open-ended` | pg_cron job | `5 * * * *` (UTC) |

---

## 3. Applying it on another PC

Open the web app's `.env.local` and look at `VITE_SUPABASE_URL`.

### A. Same Supabase project (normal case) — update the web app only

- [ ] `git checkout main` and `git pull origin main`
- [ ] `npm install`
- [ ] `npm run build` → ends with `✓ built in …`
- [ ] Restart the local server the way you normally run it (`npm run dev`: Ctrl+C, start again;
      serving `dist/`: restart that server)
- [ ] Hard refresh the browser (`Ctrl + Shift + R`)
- [ ] Sign in → admin screen: KPI **"Ongoing (no end date)"** is visible; ongoing items show
      under **"Ongoing — no end date"** with **End today / Pick end date**

### B. A separate Supabase project — database setup first, then step A

1. Supabase dashboard → **Database → Extensions** → search `pg_cron` → enable.
2. **SQL Editor → New query** → paste the SQL in the appendix → **Run** → `Success`.
3. **Integrations → Cron** (or **Database → Cron Jobs**) → `extend-open-ended`, `5 * * * *`,
   active. After the next :05, **History** shows *Succeeded*.
4. Then section A.

Requirement: the project has `risk_candidates`, `strikes_manual`, `raw_intake`, `events` with
the same structure.

### Check (read-only, SQL Editor)
```sql
select id, country, date_start, date_end, admin_decision, promoted
from risk_candidates where open_ended order by date_start;

select jobname, schedule, active from cron.job;
select status, start_time, return_message
from cron.job_run_details order by start_time desc limit 5;
```

---

## 4. Using it in the admin screen

| Situation | Do |
|---|---|
| Still ongoing | leave **End** blank when entering dates |
| Single day | End = same date as Start |
| Ended today | **End today** |
| Ended earlier | **Pick end date** → date → **End** |
| Ended by mistake | no undo button yet; set the candidate's `date_end` to empty in SQL and it becomes ongoing again |

The section also lists **pending** items, so they can be closed before approval.

## 5. Effect on the collection pipeline

- No PC job is needed for the extension.
- Collectors must leave `date_end` empty when no end date is known (never copy the start date).
  `wf2c` copies the candidate's `date_end` as is.

## 6. Troubleshooting

| Symptom | Check |
|---|---|
| No "Ongoing" section | it only appears when there is at least one ongoing item; the KPI tile is always there — if it is missing, the web app is old (3A) |
| End → "로그인이 필요합니다" (sign-in required) | signed out; sign in again |
| End → "종료일은 시작일(…) 이후여야 합니다" | chosen date is before the start date |
| End date not growing | `cron.job_run_details` recent rows; share `return_message` |
| Calendar period differs from the candidate | downstream match (country + start + source URL) failed for that item; check its rows |

Error messages from the database are in Korean (as stored); the meaning is given in brackets above.

### Roll back (only if needed)
```sql
select cron.unschedule('extend-open-ended');
drop trigger if exists candidate_open_ended on public.risk_candidates;
```

---

## Appendix — database SQL (only for a separate Supabase project)

```sql
-- 1) ongoing flag
alter table public.risk_candidates add column if not exists open_ended boolean not null default false;

-- 2) today in Europe/Bratislava
create or replace function public.local_today() returns date
language sql stable as $$ select (now() at time zone 'Europe/Bratislava')::date $$;

-- 3) trigger: empty end → ongoing + today; explicit end typed by a person → not ongoing
create or replace function public.trg_candidate_open_ended() returns trigger
language plpgsql as $$
begin
  if new.date_start is not null and new.date_end is null then
    new.open_ended := true;
    new.date_end := greatest(new.date_start, public.local_today());
  elsif tg_op = 'UPDATE'
        and new.date_end is distinct from old.date_end
        and coalesce(current_setting('eurologix.extending', true), '') <> 'on' then
    new.open_ended := false;
  end if;
  return new;
end $$;

drop trigger if exists candidate_open_ended on public.risk_candidates;
create trigger candidate_open_ended
  before insert or update of date_start, date_end on public.risk_candidates
  for each row execute function public.trg_candidate_open_ended();

-- 4) downstream rows (strikes_manual · raw_intake · events)
create or replace function public._set_candidate_end(c public.risk_candidates, d date) returns void
language plpgsql security definer set search_path = public as $$
begin
  update strikes_manual s set date_end = d
   where s.country = c.country and s.date_start = c.date_start
     and s.source_url is not distinct from c.source_url
     and (c.source_url <> 'manual' or s.event_name = c.event_name)
     and s.date_end is distinct from d;
  update raw_intake r set date_end = d::text
   where r.country = c.country and r.date_start = c.date_start::text
     and r.source_url is not distinct from c.source_url
     and (c.source_url <> 'manual' or r.event_name = c.event_name)
     and r.date_end is distinct from d::text;
  update events e set date_end = d, upd_dtm = now()
   where e.country = c.country and e.date_start = c.date_start
     and e.source_url is not distinct from c.source_url
     and (c.source_url <> 'manual' or e.event_name = c.event_name)
     and e.date_end is distinct from d;
end $$;

-- 5) hourly extension
create or replace function public.extend_open_ended() returns integer
language plpgsql security definer set search_path = public as $$
declare d date := public.local_today(); n int := 0; c public.risk_candidates;
begin
  perform set_config('eurologix.extending', 'on', true);
  for c in select * from risk_candidates
            where open_ended and admin_decision in ('pending', 'approved')
              and date_start is not null and date_start <= d and (date_end is null or date_end < d)
  loop
    update risk_candidates set date_end = d where id = c.id;
    perform public._set_candidate_end(c, d);
    n := n + 1;
  end loop;
  perform set_config('eurologix.extending', '', true);
  return n;
end $$;

-- 6) admin End button
create or replace function public.end_open_ended(p_id bigint, p_end date) returns text
language plpgsql security definer set search_path = public as $$
declare c public.risk_candidates;
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    raise exception '로그인이 필요합니다';
  end if;
  select * into c from risk_candidates where id = p_id;
  if not found then raise exception '후보 #% 이 없습니다', p_id; end if;
  if not c.open_ended then raise exception '후보 #% 은 진행 중이 아닙니다', p_id; end if;
  if p_end is null or p_end < c.date_start then
    raise exception '종료일은 시작일(%) 이후여야 합니다', c.date_start;
  end if;
  perform set_config('eurologix.extending', 'on', true);
  update risk_candidates set date_end = p_end, open_ended = false where id = p_id;
  perform public._set_candidate_end(c, p_end);
  perform set_config('eurologix.extending', '', true);
  return 'ok';
end $$;

-- 7) permissions: only the End button is open, to signed-in users
revoke all on function public.extend_open_ended() from public, anon, authenticated;
revoke all on function public._set_candidate_end(public.risk_candidates, date) from public, anon, authenticated;
revoke all on function public.end_open_ended(bigint, date) from public, anon;
grant execute on function public.end_open_ended(bigint, date) to authenticated;

-- 8) hourly at :05 UTC (enable pg_cron first)
create extension if not exists pg_cron;
select cron.schedule('extend-open-ended', '5 * * * *', $$select public.extend_open_ended()$$);
```
