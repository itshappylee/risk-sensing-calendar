"""wf1d — truck driving bans from the legal rule table.

config.driving_ban_rules (standing weekday/holiday rules) × public holidays (events)
+ config.driving_ban_calendar (gazette dates for Italy, France, Spain) → 120 days of bans.
No crawling. Schedule: weekly, Monday 06:40.

Filters (same as the supplement job wf1e):
  - Sundays are not stored (the ban is a weekly constant)
  - night-only bans that do not overlap 06:00–21:00 are not stored

Order of work: compute first; only if that succeeds, delete the previous Driving Ban rows in
raw_intake and insert the new ones. Rows already rolled up into events are never deleted,
so the supplement rows from wf1e that this delete removes are still on the calendar, and
wf1e fills raw_intake again the next morning.

Stored summary text keeps its existing (Korean) wording on purpose: summary_en is what the
calendar shows, and changing summary would make wf2 rewrite every existing ban row.
"""
from datetime import datetime, timedelta, timezone

from common.config import get_config
from common.db import db, fetch_all, insert_rows
from common.log import step

NAME = "WF-1d 운행금지 산출"
HORIZON_DAYS = 120
DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]          # Sunday-first, like JS getUTCDay
DOW_EN = {"mon": "Monday", "tue": "Tuesday", "wed": "Wednesday", "thu": "Thursday",
          "fri": "Friday", "sat": "Saturday", "sun": "Sunday"}


def iso(d):
    return d.strftime("%Y-%m-%d")


def js_dow(d):
    return DOW[(d.weekday() + 1) % 7]


def to_min(t):
    h, m = t.split(":")
    return int(h) * 60 + int(m)


def fmt(m):
    return "24:00" if m == 1440 else f"{m // 60:02d}:{m % 60:02d}"


def pl_summer(year):
    """Poland summer season: last Friday of June → last Sunday before 1 September."""
    jun = datetime(year, 6, 30)
    while jun.weekday() != 4:
        jun -= timedelta(days=1)
    sep = datetime(year, 9, 1)
    sep -= timedelta(days=1)
    while sep.weekday() != 6:
        sep -= timedelta(days=1)
    return iso(jun), iso(sep)


def in_season(ds, season):
    if not season:
        return True
    if season == "pl_summer":
        a, b = pl_summer(int(ds[:4]))
        return a <= ds <= b
    frm, to = season.split("..")
    md = ds[5:]
    return (frm <= md <= to) if frm <= to else (md >= frm or md <= to)


def compute_rules(cfg, holidays, start):
    by_cd = {}
    for h in holidays:
        by_cd.setdefault(f"{h['country']}|{str(h['date_start'])[:10]}", []).append(
            {"name": h.get("event_name"), "region": h.get("region")})

    ds_, de_ = cfg["daytime_window"].split("-")
    DAY_S, DAY_E = to_min(ds_), to_min(de_)
    out = []
    for country, spec in cfg["countries"].items():
        for i in range(HORIZON_DAYS):
            d = start + timedelta(days=i)
            ds, dow = iso(d), js_dow(d)
            hols = by_cd.get(f"{country}|{ds}", [])
            hit = []
            for r in spec["rules"]:
                if not in_season(ds, r.get("season")):
                    continue
                if r["on"] == "daily" or r["on"] == dow:
                    hit.append({"r": r})
                    continue
                if r["on"] == "holiday" and hols:
                    if r.get("holidays"):
                        matched = [h for h in hols if any(n in (h["name"] or "") for n in r["holidays"])]
                    else:
                        matched = [h for h in hols if not h["region"]]   # regional holidays would overstate
                    if matched:
                        regions = [h["region"] for h in matched if h["region"]]
                        hit.append({"r": r, "holiday": " / ".join(h["name"] for h in matched),
                                    "holiday_region": regions[0] if regions else None})
            if not hit:
                continue

            seg = sorted([to_min(a), to_min(b)] for a, b in (x["r"]["time"].split("-") for x in hit))
            merged = []
            for s in seg:
                if merged and s[0] <= merged[-1][1]:
                    merged[-1][1] = max(merged[-1][1], s[1])
                else:
                    merged.append(list(s))

            day_min = sum(max(0, min(b, DAY_E) - max(a, DAY_S)) for a, b in merged)
            if day_min == 0:
                continue          # night-only
            if dow == "sun":
                continue          # Sunday

            iv = ", ".join(f"{fmt(a)}-{fmt(b)}" for a, b in merged)
            why = " + ".join(f"공휴일({x['holiday']})" if x.get("holiday") else
                             "상시 야간" if x["r"]["on"] == "daily" else f"{x['r']['on']} 규정" for x in hit)
            why_en = " + ".join(f"Holiday ({x['holiday']})" if x.get("holiday") else
                                "Standing night rule" if x["r"]["on"] == "daily" else
                                f"{DOW_EN.get(x['r']['on'], x['r']['on'])} rule" for x in hit)
            partial = any(x["r"].get("partial") for x in hit)
            scope = next((x["r"]["scope"] for x in hit if x["r"].get("scope")), None)
            scope_en = next((x["r"].get("scope_en") for x in hit if x["r"].get("scope")), None)
            hol_region = next((x["holiday_region"] for x in hit if x.get("holiday_region")), None)

            out.append({
                "event_type": "Driving Ban", "country": country, "region": None,
                "date_start": ds, "date_end": ds,
                "time_start": fmt(merged[0][0]), "time_end": fmt(merged[-1][1]),
                "event_name": "Truck driving ban",
                "summary": f"금지 {iv} · {why} · {spec['weight']}"
                           + (f" · ⚠️ 전국 아님: {scope or '일부 구간·차량 한정'}" if partial else "")
                           + (f" · ⚠️ 해당 지역만: {hol_region}" if hol_region else "")
                           + f" · 근거 {spec['legal']}",
                "summary_en": f"Banned {iv} · {why_en} · {spec['weight']}"
                              + (f" · ⚠️ Not nationwide: {scope_en or 'certain sections/vehicles only'}" if partial else "")
                              + (f" · ⚠️ That region only: {hol_region}" if hol_region else "")
                              + f" · Legal basis {spec['legal']}",
                "transport_mode": "road",
                "source_url": spec["source"],
            })
    return out


def apply_calendar(rows, cal, today):
    """Countries whose gazette lists exact dates (Italy, France, Spain). Gazette rows win over rule rows."""
    if not cal:
        return rows
    DAY_S, DAY_E = 360, 1260
    to = iso(datetime.strptime(today, "%Y-%m-%d") + timedelta(days=120))
    warn_scope = lambda s: s and any(k in s for k in ("전국 아님", "구간", "한정", "없다"))
    out = []
    for year, by_c in (cal.get("years") or {}).items():
        for country, c in by_c.items():
            for row in c.get("dates") or []:
                date, time, region = row[0], row[1], (row[2] if len(row) > 2 else None)
                if date < today or date > to:
                    continue
                if datetime.strptime(date, "%Y-%m-%d").weekday() == 6:
                    continue
                a, z = time.split("-")
                if min(to_min(z), DAY_E) <= max(to_min(a), DAY_S):
                    continue
                scope_txt = f" · ⚠️ {c['scope']}" if warn_scope(c.get("scope")) else ""
                scope_en = f" · ⚠️ {c['scope_en']}" if warn_scope(c.get("scope")) and c.get("scope_en") else ""
                out.append({
                    "event_type": "Driving Ban", "country": country, "region": region or None,
                    "date_start": date, "date_end": date, "time_start": a, "time_end": z,
                    "event_name": "Truck driving ban",
                    "summary": f"금지 {time} · 관보 달력({year})" + (f" · {region}" if region else "")
                               + f" · {c['weight']}{scope_txt} · 근거 {c['legal']}",
                    "summary_en": f"Banned {time} · Gazette calendar ({year})" + (f" · {region}" if region else "")
                                  + f" · {c['weight']}{scope_en} · Legal basis {c['legal']}",
                    "transport_mode": "road", "source_url": c["source"],
                })
    keys = {f"{r['country']}|{r['date_start']}" for r in out}
    kept = [r for r in rows if f"{r['country']}|{r['date_start']}" not in keys]
    return kept + out


def run():
    step("calendar config")
    cal = get_config("driving_ban_calendar", required=False)
    step("rule config")
    cfg = get_config("driving_ban_rules")
    step("holidays")
    holidays = fetch_all("events", where=lambda q: q.eq("event_type", "Bank Holiday"), order="event_id")

    step("apply rules")
    start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=None)
    rows = compute_rules(cfg, holidays, start)
    if not rows:
        raise RuntimeError("no driving ban computed — check the rule table or the holiday query")
    step("apply calendar")
    rows = apply_calendar(rows, cal, iso(start))

    # Only after a successful computation: replace the previous rows
    step("delete previous")
    db().table("raw_intake").delete().eq("event_type", "Driving Ban").execute()
    step("save raw_intake")
    insert_rows("raw_intake", rows)
    print(f"  driving bans saved: {len(rows)}")
