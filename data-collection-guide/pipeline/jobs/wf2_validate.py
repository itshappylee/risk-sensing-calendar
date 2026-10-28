"""wf2 — roll up raw_intake + strikes_manual, score them, and save to events.

raw_intake + strikes_manual + existing events → roll-up → score → insert / update / quarantine.
A row that fails to save is logged (ops_log warn) and the rest continue — one bad row must not
block the whole run.

2026-10-28: trafficban.com added to TRUSTED_SRC so driving-ban supplement rows (wf1e) are
verified='yes' and appear on the calendar (the app hides verified != 'yes').
Keep this list in sync with config.verified_policy.auto_trusted.hosts.
"""
import re
from datetime import datetime

from common.countries import CC
from common.db import db, fetch_all
from common.log import log, step

NAME = "WF-2 검증·판정·저장"
TYPE_ABBR = {"Bank Holiday": "BH", "Weather": "WX", "Strike": "ST", "Driving Ban": "DB", "Incident": "IN"}

# Hazard classes — order matters (non-transport heat/fire first)
HAZARD = [
    ("heat", r"high[-\s]?temperatur|extreme (high|hot)|heat ?wave|hitze|canicul|calor", False),
    ("fire", r"forest ?fire|wildfire|fire danger|waldbrand|incend", False),
    ("uv", r"\buv\b|ultraviolet", False),
    ("thunderstorm", r"thunderstorm|gewitter|orage|temporale|tormenta", False),
    ("snow_ice", r"\bsnow|\bice\b|icy|freez|black ?ice|blizzard|schnee|glatteis|neige", True),
    ("rain_flood", r"rain|flood|hochwasser|inondation|pluie|lluvia", True),
    ("wind", r"wind|gale|gust|hurricane|storm|sturm|vent", True),
    ("fog", r"\bfog\b|nebel|brouillard", True),
    ("coastal", r"coastal|sea level|wave|küsten|marea", True),
    ("avalanche", r"avalanche|lawine|valanga", True),
]
HAZARD = [(n, re.compile(rx, re.I), t) for n, rx, t in HAZARD]
MODE_RULES = [
    (re.compile(r"\bsnow|\bice\b|icy|freez|blizzard|schnee|glatteis|neige", re.I), ["rail", "road"]),
    (re.compile(r"\bwind|gale|gust|hurricane|\bstorm\b|sturm|vent", re.I), ["air", "sea"]),
    (re.compile(r"rain|flood|hochwasser|inondation|pluie|lluvia", re.I), ["rail", "road"]),
]
MODE_SYN = {"train": "rail", "railway": "rail", "rail": "rail", "truck": "road", "lorry": "road", "hgv": "road",
            "road": "road", "flight": "air", "airport": "air", "air": "air", "port": "sea", "maritime": "sea",
            "ship": "sea", "sea": "sea"}
# verified = passed human review. Official sources and manual entries are trusted automatically.
TRUSTED_SRC = [re.compile(p, re.I) for p in [
    r"date\.nager\.at", r"feeds\.meteoalarm\.org", r"bmv\.de", r"usp\.gv\.at", r"astra\.admin\.ch", r"md\.gov\.cz",
    r"mindop\.sk", r"njt\.jog\.gov\.hu", r"promet\.si", r"gddkia\.gov\.pl", r"narodne-novine\.nn\.hr",
    r"police\.public\.lu", r"mit\.gov\.it", r"bison-fute\.gouv\.fr", r"boe\.es",
    r"trafficban\.com",   # 2026-10-28 — driving-ban supplement (wf1e); summary carries "legal basis not verified"
]]
# Tags written by the approval step (old Korean and current English forms both exist in the data)
HUMAN_MARK = re.compile(r"관리자 승인|직접 입력|Admin approved|Manual entry")
META_TAIL = re.compile(r"\s*·\s*(관리자 승인|직접 입력|Admin approved|Manual entry)\s*\([^)]*\)\s*·\s*(후보|candidate)\s*#\d+\s*$")
HANGUL = re.compile(r"[가-힣]")


# ── Small helpers ─────────────────────────────────────────────────────
def clean(v):
    if v is None:
        return None
    return re.sub(r"\s+", " ", str(v).strip()) or None


def is_date(d):
    return bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(d) if d is not None else ""))


def J(*parts):
    """Join with '|' (None → empty)."""
    return "|".join("" if p is None else str(p) for p in parts)


def norm_mode(v):
    if not v:
        return None
    s = {MODE_SYN.get(x.strip().lower(), x.strip().lower()) for x in str(v).split(",")}
    s.discard("")
    return ",".join(sorted(s)) if s else None


def derive_mode(text):
    s = {m for rx, modes in MODE_RULES if rx.search(str(text or "")) for m in modes}
    return ",".join(sorted(s)) if s else None


def classify_hazard(text):
    for name, rx, relevant in HAZARD:
        if rx.search(str(text or "")):
            return {"name": name, "relevant": relevant}
    return {"name": "other", "relevant": True}          # unknown → treat as transport-relevant (safe side)


def is_trusted(u):
    return u == "manual" or any(p.search(str(u or "")) for p in TRUSTED_SRC)


def sort_region(v):
    parts = [s.strip() for s in str("" if v is None else v).split(",") if s.strip()]
    return ",".join(sorted(set(parts))) if parts else ""


def nat_key(country, region, typ, date):
    return J(country, sort_region(region) or "ALL", typ, date)


def rhash(s):
    """FNV-1a 32-bit → base36, 7 chars. Must reproduce existing event_id values exactly."""
    h = 0x811C9DC5
    data = s.encode("utf-16-le")                         # same unit as JS charCodeAt
    for i in range(0, len(data), 2):
        h ^= data[i] | (data[i + 1] << 8)
        h = (h * 0x01000193) & 0xFFFFFFFF
    digits, out = "0123456789abcdefghijklmnopqrstuvwxyz", ""
    while True:
        h, r = divmod(h, 36)
        out = digits[r] + out
        if h == 0:
            break
    return out.upper().rjust(7, "0")[-7:]


def slug(s):
    return re.sub(r"[^A-Z0-9]", "", str(s or "").upper())[:12] or "X"


def days_between(a, b):
    """Days from date_start to date_end, both ends included. None if a date is invalid."""
    try:
        return (datetime.strptime(b, "%Y-%m-%d") - datetime.strptime(a, "%Y-%m-%d")).days + 1
    except Exception:
        return None


def strip_meta(s):
    t = META_TAIL.sub("", "" if s is None else str(s)).strip()
    return t or None


def has_hangul(s):
    return bool(HANGUL.search(str(s or "")))


def _mm(t, default):
    try:
        p = str(t or "").split(":")
        return int(float(p[0])) * 60 + int(float(p[1] if len(p) > 1 and p[1] else 0))
    except Exception:
        return default


# ── Scoring (business rules §1–5). reason = Korean text, reason_en = stored English text ──
def score(b, regions, days, streaks):
    parts, en = [], []
    t = b["event_type"]
    if t == "Bank Holiday":
        s = 1
        parts.append("공휴일 기본 1점"); en.append("Bank holiday base 1 point")
    elif t == "Weather":
        hzs = list(b["_hazards"].values()) if b.get("_hazards") else ([b["_hazard"]] if b.get("_hazard") else [])
        hz_name = " + ".join(sorted(h["name"] for h in hzs)) or "unknown"
        if not any(h["relevant"] for h in hzs):
            s = 1
            parts.append(f"운송 무관 hazard({hz_name}) 1점"); en.append(f"Non-transport hazard ({hz_name}) 1 point")
        else:
            s = 3
            parts.append(f"운송 영향 hazard({hz_name}) 3점"); en.append(f"Transport-affecting hazard ({hz_name}) 3 points")
            if regions >= 10:
                s += 1; parts.append(f"광역 {regions}개 지역 +1"); en.append(f"{regions} regions affected +1")
            if days is not None and days >= 2:
                s += 1; parts.append(f"{days}일 지속 +1"); en.append(f"{days}-day duration +1")
    elif t == "Strike":
        k = b.get("_strike") or {}
        if k.get("sector") == "indirect":
            s = 1; parts.append("물류 간접 부문 1점"); en.append("Indirect logistics sector 1 point")
        else:
            s = 3; parts.append("물류 직접 부문 3점"); en.append("Direct logistics sector 3 points")
        dd = days_between(b.get("date_start"), b.get("date_end")) if (b.get("date_start") and b.get("date_end")) else 1
        if k.get("nationwide"):
            s += 1; parts.append("전국 규모 +1"); en.append("Nationwide +1")
        if dd is not None and dd >= 3:
            s += 1; parts.append(f"기간 {dd}일 +1"); en.append(f"{dd}-day duration +1")
        if k.get("small_single_site"):
            s -= 1; parts.append("소규모·단일사업장 −1"); en.append("Small/single-site −1")
        if k.get("unconfirmed"):
            s -= 1; parts.append("예고만·미확정 −1"); en.append("Announced only, unconfirmed −1")
        s = max(1, s)
    elif t == "Driving Ban":
        DAY_S, DAY_E = 360, 1260
        st = max(_mm(b["time_start"], DAY_S), DAY_S) if b.get("time_start") else DAY_S
        ed = min(_mm(b["time_end"], DAY_E), DAY_E) if b.get("time_end") else DAY_E
        day_hrs = max(0, ed - st) / 60
        s = 3 if day_hrs >= 10 else 1
        parts.append(f"주간 15시간 중 {day_hrs:.1f}시간 금지 → {s}점")
        en.append(f"{day_hrs:.1f} of 15 daytime hours banned → {s} point{'s' if s > 1 else ''}")
        streak = streaks.get(f"{b['country']}|{b['date_start']}", 1)
        if streak >= 3:
            s += 1; parts.append(f"{streak}일 연속 +1"); en.append(f"{streak}-day consecutive run +1")
        if streak >= 4:
            s += 1; parts.append("4일 이상 연속 +1"); en.append("4+ day consecutive run +1")
    elif t == "Incident":
        txt = ((b.get("event_name") or "") + " " + (b.get("summary") or "")).lower()

        def hit(k):
            return bool(re.search(r"(^|[^a-z])" + re.escape(k) + r"(s|es|ed|ing)?($|[^a-z])", txt, re.I))

        def any_of(words):
            return any(hit(k) if k.isascii() else (k in txt) for k in words)

        BLOCK = ["closure", "closed", "block", "blockade", "shut", "suspend", "halt", "impassable", "cancel",
                 "통제", "차단", "폐쇄", "중단"]
        PARTIAL = ["lane closure", "single lane", "one lane", "partial", "contraflow", "부분 통제"]
        if any_of(BLOCK) and not any_of(PARTIAL):
            s = 3; parts.append("통행 차단 3점"); en.append("Through traffic blocked → 3 points")
        else:
            s = 1; parts.append("지연·부분 통제 1점"); en.append("Delay or partial restriction → 1 point")
        if any_of(["nationwide", "nationally", "across the country", "national network", "전국"]):
            s += 1; parts.append("전국 규모 +1"); en.append("Nationwide +1")
        dd = days_between(b.get("date_start"), b.get("date_end")) if (b.get("date_start") and b.get("date_end")) else 1
        if dd is not None and dd >= 3:
            s += 1; parts.append(f"기간 {dd}일 +1"); en.append(f"{dd}-day duration +1")
        s = max(1, s)
    else:
        s = None
        parts.append(f"{t} 판정 규칙 미구현"); en.append(f"{t} scoring rule not yet implemented")
    return (None if s is None else min(5, s)), " | ".join(parts), " | ".join(en)


# ── Roll-up + scoring → rows to save ──────────────────────────────────
def build(raw_rows, strikes, existing_rows):
    rows = [r for r in raw_rows if r and r.get("event_type")]

    existing, existing_cd = {}, {}
    for e in existing_rows:
        if not e or not e.get("event_id"):
            continue
        existing[nat_key(e["country"], e.get("region"), e["event_type"], e["date_start"])] = e
        existing_cd.setdefault(J(e["country"], e["event_type"], e["date_start"]), []).append(e)

    norm = [{
        "event_type": clean(r.get("event_type")), "country": clean(r.get("country")), "region": clean(r.get("region")),
        "date_start": clean(r.get("date_start")),
        "date_end": clean(r.get("date_end")) or clean(r.get("date_start")),
        "time_start": r.get("time_start") or None, "time_end": r.get("time_end") or None,
        "event_name": clean(r.get("event_name")), "summary": clean(r.get("summary")),
        "event_name_en": clean(r.get("event_name_en")), "summary_en": clean(r.get("summary_en")),
        "transport_mode": clean(r.get("transport_mode")), "source_url": clean(r.get("source_url")),
        "_human": bool(HUMAN_MARK.search(str(r.get("summary") or ""))),
    } for r in rows]

    for st in strikes:
        if not st or not st.get("country"):
            continue
        norm.append({
            "event_type": "Strike", "country": clean(st["country"]), "region": clean(st.get("region")),
            "date_start": clean(st.get("date_start")), "date_end": clean(st.get("date_end")) or clean(st.get("date_start")),
            "time_start": None, "time_end": None,
            "event_name": clean(st.get("event_name")), "summary": clean(st.get("summary")),
            "event_name_en": None, "summary_en": None,
            "transport_mode": norm_mode(st.get("transport_mode")),
            "source_url": clean(st.get("source_url")) or "manual",
            "_strike": {"sector": st.get("sector"), "nationwide": bool(st.get("nationwide")),
                        "small_single_site": bool(st.get("small_single_site")), "unconfirmed": bool(st.get("unconfirmed"))},
            "_human": True,
        })

    # Roll-up — the key must match the events UNIQUE (country, region, event_type, date_start)
    buckets = {}
    for r in norm:
        hz = classify_hazard((r["event_name"] or "") + " " + (r["summary"] or "")) if r["event_type"] == "Weather" else None
        if r["event_type"] == "Weather":
            key = J(r["country"], r["event_type"], r["date_start"])
        else:
            key = J(r["country"], r["event_type"], r["date_start"], sort_region(r["region"]) or "ALL")
        if key not in buckets:
            buckets[key] = {**r, "_hazard": hz, "_regions": {}, "_rows": 0, "_urls": {}}
        b = buckets[key]
        b["_rows"] += 1
        if hz:
            b.setdefault("_hazards", {})[hz["name"]] = hz
        if r["event_type"] == "Bank Holiday" and r["event_name"] and b["event_name"] \
                and r["event_name"] not in b["event_name"].split(" / "):
            b["event_name"] = " / ".join(sorted(set(b["event_name"].split(" / ") + [r["event_name"]])))
        if r["event_type"] == "Bank Holiday" and r["event_name_en"] and b["event_name_en"] \
                and r["event_name_en"] not in b["event_name_en"].split(" / "):
            b["event_name_en"] = " / ".join(sorted(set(b["event_name_en"].split(" / ") + [r["event_name_en"]])))
        if r["region"]:
            for x in str(r["region"]).split(","):
                if x.strip():
                    b["_regions"][x.strip()] = True
        if r["source_url"]:
            b["_urls"][r["source_url"]] = True
        if r["date_end"] and b["date_end"] and r["date_end"] > b["date_end"]:
            b["date_end"] = r["date_end"]
        if r["time_start"] and (not b["time_start"] or r["time_start"] < b["time_start"]):
            b["time_start"] = r["time_start"]
        if r["time_end"] and (not b["time_end"] or r["time_end"] > b["time_end"]):
            b["time_end"] = r["time_end"]

    # Driving-ban consecutive-day table
    streaks, by_country = {}, {}
    for b in buckets.values():
        if b["event_type"] == "Driving Ban":
            by_country.setdefault(b["country"], set()).add(b["date_start"])
    for country, dates in by_country.items():
        uniq = sorted(dates)
        run_start = 0
        for i, d in enumerate(uniq):
            if i > 0 and days_between(uniq[i - 1], d) != 2:     # one day apart = 2 days inclusive
                run_start = i
            streaks[f"{country}|{d}"] = i - run_start + 1

    per_cd = {}
    for b in buckets.values():
        k = J(b["country"], b["event_type"], b["date_start"])
        per_cd[k] = per_cd.get(k, 0) + 1

    def find_prev(rec):
        h = existing.get(nat_key(rec["country"], rec["region"], rec["event_type"], rec["date_start"]))
        if h:
            return h
        k = J(rec["country"], rec["event_type"], rec["date_start"])
        rows_cd = existing_cd.get(k, [])
        return rows_cd[0] if (len(rows_cd) == 1 and per_cd.get(k, 0) == 1) else None

    out = []
    stats = {"in_rows": len(rows), "events": len(buckets), "insert": 0, "update": 0, "skip": 0, "invalid": 0}
    for b in buckets.values():
        regions = len(b["_regions"])
        days = days_between(b["date_start"], b["date_end"]) if (b["date_start"] and b["date_end"]) else 1
        severity, reason, reason_en = score(b, regions, days, streaks)

        summary_en = (strip_meta(b["summary_en"])
                      or (None if has_hangul(b["summary"]) else strip_meta(b["summary"]))
                      or b["event_name_en"]
                      or (None if has_hangul(b["event_name"]) else b["event_name"]))
        cc = CC.get(b["country"]) or slug(b["country"])[:2]
        reg_sorted = sorted(b["_regions"])
        disc = "ALL" if regions == 0 else (slug(reg_sorted[0]) if regions == 1 else "R" + rhash(",".join(reg_sorted)))
        first_url = next(iter(b["_urls"]), None)

        problems = []
        if not b["country"]:
            problems.append("country missing")
        if not is_date(b["date_start"]):
            problems.append(f"bad date_start ({b['date_start']})")
        if not is_date(b["date_end"]):
            problems.append(f"bad date_end ({b['date_end']})")
        if not b["event_name"]:
            problems.append("event_name missing")
        if severity is None:
            problems.append("no scoring rule")

        rec = {
            "event_id": f"{cc}-{TYPE_ABBR.get(b['event_type'], 'XX')}-{str(b['date_start'] or '').replace('-', '')}-{disc}",
            "event_type": b["event_type"], "country": b["country"],
            "region": ",".join(reg_sorted) if regions else None,
            "date_start": b["date_start"], "date_end": b["date_end"],
            "time_start": b["time_start"], "time_end": b["time_end"],
            "event_name": b["event_name"], "event_name_en": b["event_name_en"] or None,
            "summary": summary_en or strip_meta(b["summary"]) or b["event_name"],   # stored in English
            "summary_en": summary_en,
            "transport_mode": norm_mode(b["transport_mode"])
                              or (derive_mode(f"{b['event_name']} {b['summary'] or ''}") if b["event_type"] == "Weather" else None)
                              or "unknown",
            "source_url": b["source_url"] or first_url or "manual",
            "severity": severity,
            "severity_reason": reason_en or reason,
            "severity_reason_en": reason_en or reason,
            "status": "active",
            "verified": "yes" if (b["_human"] or is_trusted(b["source_url"] or first_url or "manual")) else "no",
        }
        if problems:
            out.append(("quarantine", rec, "; ".join(problems)))
            stats["invalid"] += 1
            continue
        prev = find_prev(rec)
        if prev:
            rec["event_id"] = prev["event_id"]
            # An admin's "excluded" decision must survive re-runs
            if prev.get("status") == "excluded":
                rec["status"] = "excluded"
            changed = any(("" if prev.get(k) is None else str(prev.get(k))) != ("" if rec.get(k) is None else str(rec.get(k)))
                          for k in ["severity", "region", "date_end", "summary", "transport_mode", "severity_reason",
                                    "verified", "summary_en", "severity_reason_en", "event_name_en"])
            if changed:
                out.append(("update", rec, None)); stats["update"] += 1
            else:
                stats["skip"] += 1
        else:
            out.append(("insert", rec, None)); stats["insert"] += 1
    return out, stats


def run():
    step("raw_intake")
    raw = fetch_all("raw_intake")
    step("strikes_manual")
    strikes = fetch_all("strikes_manual")
    step("existing events")
    existing = fetch_all("events", order="event_id")

    step("roll-up / scoring")
    out, stats = build(raw, strikes, existing)
    print("  roll-up / scoring:", stats)

    fails = 0
    for action, rec, why in out:
        try:
            if action == "insert":
                step("insert events")
                db().table("events").insert(rec).execute()
            elif action == "update":
                step("update events")
                fields = {k: v for k, v in rec.items() if k != "event_id"}
                db().table("events").update(fields).eq("event_id", rec["event_id"]).execute()
            else:
                step("quarantine")
                db().table("quarantine").insert({"raw_data": rec, "fail_reason": why}).execute()
        except Exception as e:
            fails += 1
            log("warn", NAME, f"{action} failed {rec['event_id']}: {e}", node=action)
    if fails:
        print(f"  save failures: {fails} (see ops_log warn)")
