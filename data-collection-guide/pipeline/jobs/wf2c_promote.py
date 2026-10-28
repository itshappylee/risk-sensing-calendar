"""wf2c — promote approved candidates toward the calendar.

risk_candidates (admin_decision = approved, promoted = false)
  strike   → strikes_manual
  incident / manual driving ban / weather / holiday → raw_intake
  required field missing → warning in ops_log, not promoted ("hold")
Scoring is NOT done here; wf2 is the only place that scores.

Ongoing items (no end date): the database fills date_end with today and keeps extending it,
including the strikes_manual / raw_intake / events rows created from it. This job simply copies
the candidate's date_end. Do not replace an empty end date with the start date.
"""
import re

from common.db import db, fetch_all
from common.log import log, step

NAME = "WF-2c 승인·승격"
MODE_SYN = {"train": "rail", "railway": "rail", "rail": "rail", "truck": "road", "lorry": "road", "hgv": "road",
            "road": "road", "flight": "air", "airport": "air", "air": "air", "port": "sea", "maritime": "sea",
            "ship": "sea", "sea": "sea"}
MANUAL = {"driving_ban": "Driving Ban", "weather": "Weather", "bank_holiday": "Bank Holiday"}
RAW_COLS = ["event_type", "country", "region", "date_start", "date_end", "time_start", "time_end",
            "event_name", "summary", "transport_mode", "source_url", "event_name_en", "summary_en"]


def norm_mode(v):
    if not v:
        return None
    s = {MODE_SYN.get(x.strip().lower(), x.strip().lower()) for x in str(v).split(",")}
    s.discard("")
    return ",".join(sorted(s)) if s else None


def clean(v):
    if v is None:
        return None
    return re.sub(r"\s+", " ", str(v).strip()) or None


def is_date(d):
    return bool(re.match(r"^\d{4}-\d{2}-\d{2}$", str(d or "")[:10]))


def prepare(c):
    """One candidate → (route, row to insert or hold message)."""
    country = clean(c.get("country"))
    event_name = clean(c.get("event_name")) or clean(c.get("raw_title"))
    ds = str(c.get("date_start") or "")[:10]
    # The database always sets date_end when date_start exists (ongoing → today).
    # The fallback to ds only covers rows written before that rule existed.
    de = str(c.get("date_end") or "")[:10] or ds

    problems = []
    if not country:
        problems.append("country missing")
    if not is_date(ds):
        problems.append("date_start missing — the admin must fill it when approving")
    if not event_name:
        problems.append("event_name missing")
    if c.get("category") not in ("strike", "incident", "driving_ban", "weather", "bank_holiday"):
        problems.append(f"unknown category ({c.get('category')})")
    if problems:
        return "hold", {
            "message": f'promotion on hold — candidate #{c["id"]} "{(event_name or "")[:60]}": {"; ".join(problems)}',
            "details": {"candidate_id": c["id"], "category": c.get("category"), "problems": problems,
                        "source_url": c.get("source_url")},
        }

    who = clean(c.get("reported_by")) or "admin"
    if c["category"] in MANUAL:
        t1, t2 = str(c.get("time_start") or "")[:5], str(c.get("time_end") or "")[:5]
        body = clean(c.get("raw_snippet")) or event_name
        head = f"Banned {t1}-{t2} · " if (c["category"] == "driving_ban" and t1 and t2) else ""
        return "raw", {
            "event_type": MANUAL[c["category"]], "country": country, "region": clean(c.get("region")),
            "date_start": ds, "date_end": de, "time_start": t1 or None, "time_end": t2 or None,
            "event_name": event_name,
            "summary": f"{head}{body} · Manual entry ({who}) · candidate #{c['id']}",
            "transport_mode": norm_mode(c.get("transport_mode")) or ("road" if c["category"] == "driving_ban" else None),
            "source_url": "manual",
        }
    if c["category"] == "strike":
        return "strike", {
            "country": country, "region": clean(c.get("region")),
            "date_start": ds, "date_end": de, "event_name": event_name,
            "summary": clean(c.get("raw_snippet")) or event_name,
            "sector": c["sector"] if c.get("sector") in ("direct", "indirect") else "direct",
            "nationwide": bool(c.get("nationwide")),
            "small_single_site": False,
            "unconfirmed": c.get("lifecycle_status") == "announced",   # announced only → −1 (scored in wf2)
            "transport_mode": norm_mode(c.get("transport_mode")),
            "source_url": clean(c.get("source_url")),
        }
    # incident
    return "raw", {
        "event_type": "Incident", "country": country, "region": clean(c.get("region")),
        "date_start": ds, "date_end": de, "time_start": None, "time_end": None,
        "event_name": event_name,
        "summary": f"{clean(c.get('raw_snippet')) or event_name} · Admin approved ({who}) · candidate #{c['id']}",
        "transport_mode": norm_mode(c.get("transport_mode")) or "unknown",
        "source_url": clean(c.get("source_url")) or "manual",
    }


def mark_promoted(cid):
    db().table("risk_candidates").update({"promoted": True, "needs_review": False}).eq("id", cid).execute()


def run():
    step("approved candidates")
    rows = fetch_all("risk_candidates", where=lambda q: q.eq("admin_decision", "approved").eq("promoted", False))
    rows = [r for r in rows if r.get("id") and r.get("admin_decision") == "approved" and not r.get("promoted")]

    counts = {"strike": 0, "raw": 0, "hold": 0}
    for c in rows:
        route, data = prepare(c)
        counts[route] += 1
        if route == "hold":
            step("hold")
            log("warn", NAME, data["message"], details=data["details"])
        elif route == "strike":
            step("insert strikes_manual")
            db().table("strikes_manual").insert(data).execute()
            step("mark promoted")
            mark_promoted(c["id"])
        else:
            step("insert raw_intake")
            db().table("raw_intake").insert({k: v for k, v in data.items() if k in RAW_COLS}).execute()
            step("mark promoted")
            mark_promoted(c["id"])
    print(f"  approved {len(rows)} → {counts}")
