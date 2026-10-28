# Data Collection Guide

How the Risk Sensing Calendar collects its data, and how to run the collectors on a Windows PC
with Python and Task Scheduler.

> Last updated: 2026-10-29

**In short**
1. Seven Python jobs read public sources and write to Supabase; the web app only reads `events`.
2. Rules (keywords, driving-ban rule tables, trusted sources, monitoring targets) live in the Supabase
   `config` table, not in code. Change the rule, run the tests, done.
3. On a new PC: clone this repo → create `.venv` → put the key in `.env` → run tests → run each job
   once → register the schedule (sections 4–7).

---

## 1. What runs, and when

| Job | Schedule (local time) | Reads | Writes | Purpose |
|---|---|---|---|---|
| `wf1a` holidays | 1st of month 07:00 | nager.at API | raw_intake | Public holidays, 42 countries |
| `wf1b` weather | daily 07:00 | meteoalarm (37 feeds) | raw_intake | **Red** alerts only (0 rows on quiet days is normal) |
| `wf1c` strikes / incidents | hourly :05 | 5 RSS feeds + Italian MIT strike register, `config.wf1c_detection` | risk_candidates | News → candidates waiting for review in the admin screen |
| `wf1d` driving bans | Monday 06:40 | `config.driving_ban_rules`, `config.driving_ban_calendar`, holidays | raw_intake | 120 days of truck bans from legal rules |
| `wf1e` driving-ban supplement | daily 07:10 | trafficban.com widget | raw_intake | Fills ban dates the rule table misses (~11 days ahead) |
| `wf2c` promote | hourly :05 (after wf1c) | approved candidates | strikes_manual / raw_intake | Moves approved items toward the calendar |
| `wf2` validate & save | hourly :05 (after wf2c) | raw_intake, strikes_manual, events | events / quarantine | Roll-up, scoring, save |
| `wf0b` watchdog | daily 09:10 | `config.expected_coverage`, ops_log | ops_log | Warns when a job silently stopped |

`run.py hourly` runs `wf1c → wf2c → wf2` in that order. If one fails, the next still runs.

### Data flow

```
[collect]                         [review]               [score & save]
wf1a holidays ─┐
wf1b weather ──┼────────────────► raw_intake ──────┐
wf1d bans ─────┤                     ▲             ├─► wf2 ──► events (calendar, reports)
wf1e bans+ ────┘                     │             │          └► quarantine (bad rows)
wf1c news ──► risk_candidates ──► approve ──► wf2c ──► strikes_manual ─┘
every job ──► ops_log (heartbeat, errors) ◄── wf0b watchdog
```

### Things handled inside Supabase (no PC job needed)

| Feature | How |
|---|---|
| **Ongoing events** (start date, no end date) | Database trigger + hourly `pg_cron` job extend the end date to today until an admin presses **End** in the admin screen. See [docs/open-ended-events.md](docs/open-ended-events.md). |
| Admin "End" button | RPC `end_open_ended(p_id, p_end)` — also fixes rows already on the calendar |

---

## 2. Changes on 2026-10-26 … 29 (included in this version)

| Area | Change |
|---|---|
| Country name | Türkiye is stored as **Turkey** everywhere (code, events, raw_intake, config, routes). |
| Driving bans | New job **`wf1e`**: fills missing (country, date) bans from trafficban.com (e.g. Poland 31 Oct 18–22, Croatia 30–31 Oct 15–23). **Never deletes**; existing rows (events of any status + all raw rows, including its own) are skipped, so re-runs create no duplicates. Time mismatches are logged as warnings, not written. Fails loudly if the page cannot be parsed. |
| Trusted sources | `trafficban.com` added to `wf2` `TRUSTED_SRC` and `config.verified_policy.auto_trusted.hosts` so supplement rows are verified and visible. Keep both lists in sync. |
| Strikes / protests | Turkish local source (Edirne news feed) added; Turkish action and relevance words added to `config.wf1c_detection`; the feed's country (Turkey) added to `sources.tier3_country_local`. Tested on 5 weeks of that feed: 3 of 1000 articles passed, all truck-driver border protests. |
| Ongoing events | Blank end date now means **ongoing** (auto-extended daily) instead of a single day. Single-day items need end = start. |
| Watchdog | Look-back 200 h (was 72 h) so the weekly job is judged correctly; `wf1e` added to `config.expected_coverage` (26 h). |
| Admin exclusions | `wf2` keeps `status = excluded` when it updates an existing event, so an admin's exclusion is not undone by a re-run. |

Known open issue: in `wf1c`, a candidate whose country cannot be determined is merged into an
older "UNKNOWN" candidate (even a rejected one), so it does not show up as new in the admin
screen. Not changed yet.

---

## 3. Folder layout

```
data-collection-guide/
├─ README.md                  this guide
├─ docs/open-ended-events.md  ongoing-event logic + Supabase setup
└─ pipeline/
   ├─ run.py                  entry point:  python run.py <job|hourly>
   ├─ run_job.bat             called by Task Scheduler, writes logs\<job>.log
   ├─ register_tasks.ps1      registers the schedule
   ├─ requirements.txt
   ├─ .env.example            copy to .env and put the key in
   ├─ common/                 db, ops_log, config, country list
   ├─ jobs/                   one file per job
   └─ tests/                  offline tests (+ saved trafficban page in fixtures/)
```

---

## 4. Requirements

- [ ] Windows PC with **Python 3.11+** (`py --version`)
- [ ] Git, and access to this repository
- [ ] Repository path **without spaces or non-ASCII characters** (e.g. `C:\risk-sensing-calendar`)
- [ ] **Supabase service_role (secret) key** — Supabase → Project Settings → API Keys

> ⚠️ The service_role key bypasses all database security. Put it **only** in `pipeline\.env`
> on this PC. Never commit it, email it, or paste it into chat. `.env` is git-ignored.

---

## 5. Setup (PowerShell, one line at a time)

**Step 1 — get the code**
```powershell
cd C:\
git clone https://github.com/itshappylee/risk-sensing-calendar.git
cd C:\risk-sensing-calendar\data-collection-guide\pipeline
```
Already cloned? `cd C:\risk-sensing-calendar; git pull origin main` instead.

**Step 2 — private Python environment + packages**
```powershell
py -3 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

**Step 3 — key**
```powershell
copy .env.example .env
notepad .env
```
Fill in `SUPABASE_URL` (Project URL) and `SUPABASE_KEY` (service_role key), save.

**Step 4 — connection check (read-only)**
```powershell
.venv\Scripts\python.exe -c "from common.db import db; print(db().table('config').select('key').limit(3).execute().data)"
```
A list like `[{'key': ...}]` means it works. Errors → section 9.

**Step 5 — tests (write nothing)**
```powershell
.venv\Scripts\python.exe -m tests.test_wf1c --offline
.venv\Scripts\python.exe -m tests.test_wf1c
.venv\Scripts\python.exe -m tests.test_wf1e
```
All three must end with **`PASS`** (10/10, 10/10, 10/10). The second line uses the live
`config.wf1c_detection`. If anything fails, stop here.

---

## 6. First run (writes real data)

> If another automation is still running these same jobs, switch it off first. Running two
> runners at once makes `wf1d` delete and re-insert bans twice.

| # | Command | Expected output |
|---|---|---|
| 1 | `.venv\Scripts\python.exe run.py wf2c` | `approved N → {...}` (0 is fine) |
| 2 | `.venv\Scripts\python.exe run.py wf1c` | `filter stats …`, `new N / merged N` |
| 3 | `.venv\Scripts\python.exe run.py wf2` | `roll-up / scoring: {...}` |
| 4 | `.venv\Scripts\python.exe run.py wf1b` | `Red alerts saved: N` (0 is fine) |
| 5 | `.venv\Scripts\python.exe run.py wf1d` | `driving bans saved: N` (dozens) |
| 6 | `.venv\Scripts\python.exe run.py wf1e` | `supplement saved: N …` |
| 7 | `.venv\Scripts\python.exe run.py wf2` | bans reach the calendar |
| 8 | `.venv\Scripts\python.exe run.py wf0b` | `rules N / warnings N` |

Check in Supabase → SQL Editor:
```sql
-- last run per job (execution_id starting with py- = this pipeline)
select workflow, max(ts) as last_run,
       round(extract(epoch from now()-max(ts))/3600,1) as hours_ago,
       max(execution_id) filter (where execution_id like 'py-%') as last_py_run
from ops_log where level='info' group by workflow order by hours_ago;

-- warnings / errors in the last day
select ts, level, workflow, node, left(message,150) as message
from ops_log where level in ('warn','error') and ts > now()-interval '1 day'
order by ts desc;
```

---

## 7. Schedule (Task Scheduler)

```powershell
cd C:\risk-sensing-calendar\data-collection-guide\pipeline
powershell -ExecutionPolicy Bypass -File .\register_tasks.ps1
```

| Task | Time | Missed run |
|---|---|---|
| RiskCalendar\hourly (wf1c→wf2c→wf2) | every hour :05 | runs once when the PC is on |
| RiskCalendar\wf1b | daily 07:00 | runs once when the PC is on |
| RiskCalendar\wf1e | daily 07:10 | runs once when the PC is on |
| RiskCalendar\wf1d | Monday 06:40 | runs once when the PC is on |
| RiskCalendar\wf1a | 1st of month 07:00 | runs once when the PC is on |
| RiskCalendar\wf0b | daily 09:10 | **does not catch up** (avoids false alarms right after start-up) |

Check: Start → Task Scheduler → `RiskCalendar` folder. Right-click a task → **Run** to test.
Logs: `pipeline\logs\<job>.log` → `Get-Content logs\hourly.log -Tail 40`.

If the script is blocked, create the task by hand: Action `…\pipeline\run_job.bat`, argument
`hourly` → Settings tab: tick **"Run task as soon as possible after a scheduled start is
missed"** → Conditions tab: untick **"Start only if on AC power"**.

**Limits of running on a PC that is on only during work hours**
1. A Red weather alert that starts and ends overnight is missed (the feed shows current alerts only).
2. Nothing warns that the PC itself is off (the watchdog runs on the same PC).
3. Monday's first hourly run is slower (weekend backlog).
Driving-ban extension of ongoing events is **not** affected — it runs inside Supabase.

---

## 8. Changing rules

| What | Where | After changing |
|---|---|---|
| Strike/protest keywords, drop patterns, source countries | `config.wf1c_detection` | `python -m tests.test_wf1c` must PASS |
| A new RSS source | `jobs/wf1c_strikes.py` `REGISTRY` (+ its country in `config.wf1c_detection.sources.tier3_country_local`) | test + one manual `run.py wf1c` |
| Driving-ban rules / gazette calendar | `config.driving_ban_rules`, `config.driving_ban_calendar` (new year each Dec–Jan) | `run.py wf1d` then `run.py wf2` |
| Trusted sources (auto-verified) | `jobs/wf2_validate.py` `TRUSTED_SRC` **and** `config.verified_policy` | `run.py wf2` |
| Monitoring targets | `config.expected_coverage.workflows` | next `wf0b` run |

Do not rename Supabase tables/columns or the job names in `run.py` (`JOBS`): the web app,
monitoring and config refer to them exactly. Some stored identifiers (job names, the
heartbeat text) are in Korean on purpose because existing data uses them.

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `KeyError: 'SUPABASE_URL'` | no `.env` in `pipeline\` | create it (step 3) |
| `401` / `Invalid API key` | wrong key or the publishable key | use the service_role key |
| `No module named ...` | wrong Python | always `.venv\Scripts\python.exe` |
| `test_wf1c` fails | a recent `config.wf1c_detection` edit | undo the last edit, re-test |
| `warn: MIT fetch failed` | Italian site down | nothing; RSS continues |
| `warn: RSS failed <source>` every day | feed URL changed | update `REGISTRY` |
| `wf1e` error "could not read any day/item" | trafficban page changed or blocked | check the page; update `parse_box` and the fixture |
| `wf1e` warn "site … / ours …" | rule table and site disagree on hours | check the official source; fix the rule table if needed |
| `warn: insert failed …` (wf2) | data conflict on one event | look up that event_id; others were saved |
| Logs stay empty | scheduler not running | Task Scheduler → "Last Run Result" |
| Many warnings on Monday morning | wf0b ran before the hourly jobs | confirm wf0b does not catch up |

---

## 10. Asking an AI assistant to change the pipeline

```
I want to change the data collection pipeline in data-collection-guide/pipeline.
Read data-collection-guide/README.md first.

Rules:
- Do not rename Supabase tables/columns or the job names in run.py.
- Keywords and rules belong in config rows, not in code.
- Scoring stays in jobs/wf2_validate.py only.
- After the change: python -m tests.test_wf1c and python -m tests.test_wf1e must PASS.
- I am not a developer: conclusion first, plain words.

Today I want to: (write here)
```
