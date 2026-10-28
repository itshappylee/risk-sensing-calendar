"""wf1e — driving-ban supplement (added 2026-10-28).

The rule table (wf1d) is correct but incomplete: it misses bans it has no rule for
(e.g. Poland/Croatia on 31 Oct 2026). This job fills only the missing (country, date) pairs
from the trafficban.com widget list (about 11 days ahead).

Rules
  - It NEVER deletes anything. "Already present" = any Driving Ban row in events
    (any status, so a date an admin excluded is not revived) or in raw_intake
    (including this job's own earlier rows). Running it again adds nothing new → no duplicates.
  - wf1d deletes all raw Driving Ban rows every Monday. That is harmless: rows already rolled
    up into events stay on the calendar, and this job refills raw_intake the next morning.
  - Same filters as wf1d: no Sundays, no night-only bans (must overlap 06:00–21:00).
  - If the site's time differs from ours for an existing (country, date), nothing is written;
    the mismatch is reported in ops_log as a warning for a human to check.
  - If the page cannot be parsed (0 days or 0 items) the job FAILS on purpose instead of
    quietly writing 0 rows.
  - Rows are marked "legal basis not verified" in the summary. trafficban.com is on the
    trusted-source list (wf2 TRUSTED_SRC and config.verified_policy) so they reach the calendar.

Widget structure (checked on the 2026-10-28 page, see tests/fixtures):
  - day:  <h2 class="bandate"><a href=".../2026-10-31">2026-10-31, Saturday</a></h2>
  - item: <div class="banbox flt" alt=".../poland.traffic_ban.details.23414.en.html">
          country ... times ("18:00 - 22:00" or "00:00 - 05:00; 22:00 - 24:00")
  - anti-scraping noise sits in elements with class="QXySIsf"; the page's own script removes
    them, so we remove them first too.

Schedule: daily 07:10 (after wf1d's Monday 06:40 run).
"""
import re
from datetime import datetime, timedelta, timezone

import requests

from common.countries import norm_country

NAME = "WF-1e 운행금지 보충"
BOX_URL = "https://trafficban.com/plugins/box.html"
SRC_PREFIX = "https://trafficban.com/"
HORIZON_DAYS = 120
DAY_S, DAY_E = 360, 1260          # 06:00–21:00 = config.driving_ban_rules.daytime_window

_NOISE = re.compile(r'<(\w+)\s+class="QXySIsf"[^>]*>[^<]*</\1>')
_TOKEN = re.compile(
    r'<h2 class="bandate"><a href="https://trafficban\.com/(?P<day>\d{4}-\d{2}-\d{2})"'
    r'|<div class="banbox flt" alt="(?P<alt>[^"]*)">(?P<inner>.*?)</div>',
    re.S,
)
_TAG = re.compile(r"<[^>]+>")
_TIME = re.compile(r"(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})")
_ID = re.compile(r"details\.(\d+)\.")


def to_min(h, m):
    return int(h) * 60 + int(m)


def fmt(m):
    return "24:00" if m == 1440 else f"{m // 60:02d}:{m % 60:02d}"


def parse_box(html):
    """Widget HTML → [{date, country_raw, country, ranges[(min, min)], ban_id, url}].
    Raises if no day or no item is found (page layout changed or access blocked)."""
    clean = _NOISE.sub("", html)
    out, cur_date, days = [], None, 0
    for m in _TOKEN.finditer(clean):
        if m.group("day"):
            cur_date = m.group("day")
            days += 1
            continue
        if cur_date is None:
            continue
        parts = [p.strip() for p in _TAG.sub("|", m.group("inner")).split("|") if p.strip()]
        if not parts:
            continue
        ranges = []
        for h1, m1, h2, m2 in _TIME.findall(" ".join(parts[1:])):
            a, z = to_min(h1, m1), to_min(h2, m2)
            if 0 <= a < z <= 1440 and int(m1) < 60 and int(m2) < 60:
                ranges.append((a, z))
        alt = m.group("alt")
        idm = _ID.search(alt)
        out.append({
            "date": cur_date,
            "country_raw": parts[0],
            "country": norm_country(parts[0]),
            "ranges": ranges,
            "ban_id": idm.group(1) if idm else None,
            "url": alt,
        })
    if days == 0 or not out:
        raise RuntimeError("could not read any day/item from the trafficban widget — layout changed or access blocked")
    return out


def existing_windows(rows):
    """events / raw_intake rows → {(country, date): [(min, min), ...]}. Empty times = all day."""
    out = {}
    for r in rows:
        if not r or not r.get("country") or not r.get("date_start"):
            continue
        ts, te = str(r.get("time_start") or "00:00")[:5], str(r.get("time_end") or "24:00")[:5]
        try:
            a, z = to_min(*ts.split(":")), to_min(*te.split(":"))
        except ValueError:
            a, z = 0, 1440
        cur = datetime.strptime(str(r["date_start"])[:10], "%Y-%m-%d")
        last = datetime.strptime(str(r.get("date_end") or r["date_start"])[:10], "%Y-%m-%d")
        n = 0
        while cur <= last and n < 400:
            out.setdefault((r["country"], cur.strftime("%Y-%m-%d")), []).append((a, z))
            cur += timedelta(days=1)
            n += 1
    return out


def build_rows(bans, today, existing):
    """bans: parse_box result. today: 'YYYY-MM-DD'. existing: existing_windows(...)
    → (new rows, info)"""
    end = (datetime.strptime(today, "%Y-%m-%d") + timedelta(days=HORIZON_DAYS)).strftime("%Y-%m-%d")
    rows, seen = [], set()
    info = {"unknown_countries": set(), "mismatch": [], "skipped_sunday": 0, "skipped_night": 0,
            "skipped_existing": 0, "bad_rows": 0}
    for b in bans:
        d = b["date"]
        if d < today or d > end:
            continue
        if not b["country"]:
            info["unknown_countries"].add(b["country_raw"])
            continue
        if not b["ranges"]:
            info["bad_rows"] += 1
            continue
        if datetime.strptime(d, "%Y-%m-%d").weekday() == 6:       # Sunday (same rule as wf1d)
            info["skipped_sunday"] += 1
            continue
        for a, z in b["ranges"]:
            if min(z, DAY_E) <= max(a, DAY_S):                      # night-only
                info["skipped_night"] += 1
                continue
            key = (b["country"], d)
            if key in existing:                                     # never touch an existing (country, date)
                info["skipped_existing"] += 1
                if not any(ea <= a and z <= ez for ea, ez in existing[key]):
                    info["mismatch"].append(f"{b['country']} {d} site {fmt(a)}-{fmt(z)} / ours "
                                            + ", ".join(f"{fmt(x)}-{fmt(y)}" for x, y in existing[key]))
                continue
            dedup = (b["country"], d, a, z)
            if dedup in seen:
                continue
            seen.add(dedup)
            iv = f"{fmt(a)}-{fmt(z)}"
            rows.append({
                "event_type": "Driving Ban", "country": b["country"], "region": None,
                "date_start": d, "date_end": d, "time_start": fmt(a), "time_end": fmt(z),
                "event_name": "Truck driving ban",
                "summary": f"금지 {iv} · trafficban.com 목록에서 보충 · ⚠️ 규정 근거 미확인 (공식 규칙표에 없는 날짜)",
                "summary_en": f"Banned {iv} · Supplemented from the trafficban.com list · ⚠️ Legal basis not verified",
                "transport_mode": "road",
                "source_url": b["url"] if (b["url"] or "").startswith(SRC_PREFIX) else BOX_URL,
            })
    return rows, info


def fetch_box():
    r = requests.get(BOX_URL, timeout=30,
                     headers={"User-Agent": "RiskCalendar-pipeline/1.0 (internal logistics risk calendar)"})
    r.raise_for_status()
    return r.text


def run():
    from common.db import fetch_all, insert_rows
    from common.log import log, step

    step("trafficban fetch")
    bans = parse_box(fetch_box())

    step("existing driving bans")
    ev = fetch_all("events", where=lambda q: q.eq("event_type", "Driving Ban"), order="event_id",
                   columns="country,date_start,date_end,time_start,time_end")
    raw = fetch_all("raw_intake", where=lambda q: q.eq("event_type", "Driving Ban"),
                    columns="id,country,date_start,date_end,time_start,time_end")
    existing = existing_windows(list(ev) + list(raw))

    step("compute supplement")
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    rows, info = build_rows(bans, today, existing)

    if rows:
        step("save raw_intake")
        insert_rows("raw_intake", rows)

    msg = (f"완료 — 보충 {len(rows)}건 (기존과 겹침 {info['skipped_existing']}, "
           f"일요일 {info['skipped_sunday']}, 야간 {info['skipped_night']})")
    warn = bool(info["mismatch"] or info["unknown_countries"])
    log("warn" if warn else "info", NAME, msg, node="compute supplement",
        details={"added": len(rows), "skipped_existing": info["skipped_existing"],
                 "skipped_sunday": info["skipped_sunday"], "skipped_night": info["skipped_night"],
                 "mismatch": info["mismatch"], "unknown_countries": sorted(info["unknown_countries"])})
    print(f"  supplement saved: {len(rows)} · mismatch {len(info['mismatch'])} · unknown {sorted(info['unknown_countries'])}")
