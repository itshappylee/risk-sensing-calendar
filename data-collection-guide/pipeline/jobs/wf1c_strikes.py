"""wf1c — strikes, incidents and protests. News RSS + the Italian MIT strike register
→ risk_candidates (waiting for human review in the admin screen).

Design points:
  1. Every source runs on its own. If the MIT site or one RSS feed is down, the others still collect.
  2. Collection window 72 hours, so a PC that is off from Friday evening to Monday morning
     still catches weekend articles. The same article (URL) is never stored twice.
  3. The judging rules (keywords, drop patterns, source countries) are NOT in this code.
     They are read from config.wf1c_detection. Change rules there, then run the tests.

2026-10-29: added the Edirne local news feed (Turkish). All three Turkey→EU road border
crossings (Kapıkule, Hamzabeyli, İpsala) are in Edirne. Turkish words were added to
config.wf1c_detection (action_terms.local.tr, relevance_terms) and the feed's country (Turkey)
to config sources.tier3_country_local.
"""
import html as htmlmod
import re
from datetime import datetime, timedelta, timezone

import feedparser
import requests

from common.config import get_config
from common.db import db, fetch_all
from common.log import log, step

NAME = "WF-1c 파업·Incident 수집"
WINDOW_HOURS = 72

# ── Source registry. lang is informational; the gate reads every language from config. ──
REGISTRY = [
    {"source_id": "loadstar", "operator": "The Loadstar", "url": "https://theloadstar.com/feed/", "channel": "multi", "tier": 3, "lang": "en"},
    {"source_id": "railfreight", "operator": "RailFreight.com", "url": "https://www.railfreight.com/feed/", "channel": "rail", "tier": 3, "lang": "en"},
    {"source_id": "aircargonews", "operator": "Air Cargo News", "url": "https://www.aircargonews.net/feed/", "channel": "air", "tier": 3, "lang": "en"},
    {"source_id": "splash247", "operator": "Splash247", "url": "https://splash247.com/feed/", "channel": "sea", "tier": 3, "lang": "en"},
    # 2026-10-29 — Edirne local news (Turkish). Covers the Turkey→EU road border crossings.
    # The feed lists ~1000 items with date-only pubDate; the 72h window keeps only recent ones.
    {"source_id": "edirneahval", "operator": "Edirne Ahval", "url": "https://www.edirneahval.com/rss", "channel": "road", "tier": 3, "lang": "tr"},
]

# ── Built-in signal words (used together with the config rules) ──
DISRUPTION_STRONG = [
    "strike", "walkout", "walk-out", "industrial action", "stoppage", "work-to-rule", "go-slow",
    "lockout", "picket", "blockade", "shutdown", "shut down", "closure", "suspension", "halted",
    "disruption", "cancelled", "canceled", "labour dispute", "labor dispute", "industrial dispute",
    "roadworks", "road works", "engineering works", "resurfacing",
    "road closure", "lane closure", "bridge closure", "tunnel closure",
]
DISRUPTION_WEAK = [
    "union", "protest", "delay", "congestion", "backlog", "suspend", "halt", "closed", "disrupt", "dispute",
    "construction", "maintenance", "diversion", "detour", "carriageway", "repair",
]
TRANSPORT = [
    "rail", "railway", "railroad", "train", "freight", "cargo", "haulage", "haulier", "trucking",
    "truck", "lorry", "hgv", "driver", "drivers", "port", "terminal", "dock", "docker", "quay",
    "shipping", "vessel", "container", "airport", "air cargo", "airfreight", "handling",
    "customs", "border", "logistics", "supply chain", "warehouse", "barge", "waterway",
    "road", "motorway", "highway", "carriageway", "bridge", "tunnel", "junction", "toll",
]
MODE_MAP = [
    ("rail", ["rail", "railway", "railroad", "train", "locomotive", "intermodal"]),
    ("road", ["truck", "trucking", "lorry", "hgv", "haulage", "haulier", "road", "motorway", "driver", "highway"]),
    ("sea", ["port", "terminal", "dock", "docker", "quay", "ship", "shipping", "vessel", "container", "maritime", "barge", "waterway", "sea"]),
    ("air", ["airport", "air cargo", "airfreight", "airline", "flight", "aviation", "ground handling", "atc", "air traffic"]),
]
COUNTRY_ALIASES = [
    ("Belgium", ["belgium", "belgian"]), ("Bulgaria", ["bulgaria", "bulgarian"]),
    ("Czechia", ["czechia", "czech republic", "czech"]), ("Denmark", ["denmark", "danish"]),
    ("Germany", ["germany", "german", "deutschland"]), ("Estonia", ["estonia", "estonian"]),
    ("Ireland", ["ireland", "irish"]), ("Greece", ["greece", "greek"]),
    ("Spain", ["spain", "spanish"]), ("France", ["france", "french"]),
    ("Croatia", ["croatia", "croatian"]), ("Italy", ["italy", "italian"]),
    ("Cyprus", ["cyprus", "cypriot"]), ("Latvia", ["latvia", "latvian"]),
    ("Lithuania", ["lithuania", "lithuanian"]), ("Luxembourg", ["luxembourg"]),
    ("Hungary", ["hungary", "hungarian"]), ("Malta", ["malta", "maltese"]),
    ("Netherlands", ["netherlands", "dutch", "holland"]), ("Austria", ["austria", "austrian"]),
    ("Poland", ["poland", "polish"]), ("Portugal", ["portugal", "portuguese"]),
    ("Romania", ["romania", "romanian"]), ("Slovenia", ["slovenia", "slovenian"]),
    ("Slovakia", ["slovakia", "slovak"]), ("Finland", ["finland", "finnish"]),
    ("Sweden", ["sweden", "swedish"]), ("Iceland", ["iceland", "icelandic"]),
    ("Norway", ["norway", "norwegian"]), ("Switzerland", ["switzerland", "swiss"]),
    ("Bosnia and Herzegovina", ["bosnia", "herzegovina"]), ("Moldova", ["moldova", "moldovan"]),
    ("Montenegro", ["montenegro"]), ("North Macedonia", ["north macedonia", "macedonia", "macedonian"]),
    ("Serbia", ["serbia", "serbian"]), ("Ukraine", ["ukraine", "ukrainian"]),
    ("United Kingdom", ["united kingdom", "britain", "british", "uk", "england", "scotland", "wales"]),
    ("Albania", ["albania", "albanian"]), ("Georgia", ["georgia", "georgian"]),
    ("Turkey", ["turkey", "turkish", "turkiye", "türkiye"]), ("Liechtenstein", ["liechtenstein"]),
    ("Kosovo", ["kosovo"]),
]
MONTHS = {"january": 0, "february": 1, "march": 2, "april": 3, "may": 4, "june": 5, "july": 6, "august": 7,
          "september": 8, "october": 9, "november": 10, "december": 11, "jan": 0, "feb": 1, "mar": 2, "apr": 3,
          "jun": 5, "jul": 6, "aug": 7, "sep": 8, "sept": 8, "oct": 9, "nov": 10, "dec": 11}
WEEKDAYS = {"sunday": 0, "monday": 1, "tuesday": 2, "wednesday": 3, "thursday": 4, "friday": 5, "saturday": 6}
STRIKE_WORDS = ["strike", "walkout", "walk-out", "industrial action", "stoppage", "work-to-rule", "go-slow",
                "lockout", "picket", "labour dispute", "labor dispute", "industrial dispute"]
CANCEL = re.compile(r"\b(call(ed)?\s+off|cancel(l)?ed|suspend(ed)?|withdraw(n)?|averted|resolved|deal\s+reached|agreement\s+reached)\b", re.I)

# ── Word matching ─────────────────────────────────────────────────────
# ⚠️ Never use plain `in`: 'port' would match inside 'transport' and 'airport'.
_word_cache = {}


def has(text, k):
    """English whole-word match, allowing plural/-ing/-ed endings."""
    if k not in _word_cache:
        _word_cache[k] = re.compile(r"(^|[^a-z])" + re.escape(k) + r"(s|es|ing|ed)?($|[^a-z])", re.I)
    return bool(_word_cache[k].search(text))


def hits(text, words):
    return [k for k in words if has(text, k)]


_term_cache = {}
_MARCH_AS_DATE = re.compile(r"(\d{1,2}\s*(st|nd|rd|th)?\s*march|march\s*\d{1,2})", re.I)


def has_term(text, k):
    """Config term match. Local languages add suffixes (trafik→trafiku, eylem→eylemi), so 0–3 extra letters are allowed."""
    if k == "march" and _MARCH_AS_DATE.search(text):
        return False  # "5 March" is a date, not a march
    if k not in _term_cache:
        _term_cache[k] = re.compile(r"(?:^|(?<=[\W\d_]))" + re.escape(k) + r"[^\W\d_]{0,3}(?![^\W\d_])", re.I)
    return bool(_term_cache[k].search(text))


def any_term(text, words):
    return any(has_term(text, k) for k in words)


def host_of(u):
    m = re.match(r"^https?://([^/?#]+)", str(u or ""), re.I)
    return re.sub(r"^www\.", "", m.group(1).lower()) if m else ""


def detect_modes(text, channel):
    found = {mode for mode, syns in MODE_MAP if any(has(text, s) for s in syns)}
    if not found and channel in ("rail", "air", "sea", "road"):
        found.add(channel)
    return ",".join(sorted(found)) if found else "unknown"


def detect_countries(text):
    return [name for name, aliases in COUNTRY_ALIASES if any(has(text, a) for a in aliases)]


# ── Dates (title + first paragraph only; if none found → None, never the collection date) ──
def _utc_date(y, mo, d):
    """Accepts overflowing days (Nov 31 → Dec 1)."""
    return datetime(y + (mo // 12), mo % 12 + 1, 1, tzinfo=timezone.utc) + timedelta(days=d - 1)


def _bump(s, anchor):
    """More than 60 days in the past → assume next year (announcements of future events)."""
    if s < anchor and (anchor - s) > timedelta(days=60):
        return s.replace(year=s.year + 1)
    return s


def parse_event_dates(text, anchor):
    none = {"start": None, "end": None, "raw": None}
    if anchor is None:
        return none
    y = anchor.year
    iso = lambda d: d.strftime("%Y-%m-%d")

    m = re.search(r"(\d{1,2})\s*[-–—]\s*(\d{1,2})\s+([a-z]+)", text)            # 23-24 july
    if m and m.group(3) in MONTHS:
        mo = MONTHS[m.group(3)]
        s, e = _utc_date(y, mo, int(m.group(1))), _utc_date(y, mo, int(m.group(2)))
        if s < anchor and (anchor - s) > timedelta(days=60):
            s, e = s.replace(year=y + 1), e.replace(year=y + 1)
        return {"start": iso(s), "end": iso(e), "raw": m.group(0)}
    m = re.search(r"([a-z]+)\s+(\d{1,2})\s*[-–—]\s*(\d{1,2})", text)            # july 23-24
    if m and m.group(1) in MONTHS:
        mo = MONTHS[m.group(1)]
        s, e = _utc_date(y, mo, int(m.group(2))), _utc_date(y, mo, int(m.group(3)))
        if s < anchor and (anchor - s) > timedelta(days=60):
            s, e = s.replace(year=y + 1), e.replace(year=y + 1)
        return {"start": iso(s), "end": iso(e), "raw": m.group(0)}
    m = re.search(r"(?:on\s+)?(\d{1,2})\s+([a-z]+)\b", text)                     # 31 march
    if m and m.group(2) in MONTHS:
        s = _bump(_utc_date(y, MONTHS[m.group(2)], int(m.group(1))), anchor)
        return {"start": iso(s), "end": iso(s), "raw": m.group(0)}
    m = re.search(r"(?:on\s+)?([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\b", text)     # march 31
    if m and m.group(1) in MONTHS:
        s = _bump(_utc_date(y, MONTHS[m.group(1)], int(m.group(2))), anchor)
        return {"start": iso(s), "end": iso(s), "raw": m.group(0)}
    m = re.search(r"(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)", text)
    if m:
        js_dow = (anchor.weekday() + 1) % 7          # Python Mon=0 → Sunday-first numbering
        diff = (WEEKDAYS[m.group(2)] - js_dow + 7) % 7 or 7
        d = anchor + timedelta(days=diff)
        return {"start": iso(d), "end": iso(d), "raw": m.group(0)}
    if re.search(r"\btomorrow\b", text):
        d = anchor + timedelta(days=1)
        return {"start": iso(d), "end": iso(d), "raw": "tomorrow"}
    return none


# ── Judging ───────────────────────────────────────────────────────────
def build_rules(cfg):
    """Turn config.wf1c_detection into ready-to-use rules."""
    at = cfg.get("action_terms") or {}
    local = [w for _k, v in (at.get("local") or {}).items() if isinstance(v, list) for w in v]
    drops = []
    for k, v in (cfg.get("drop_patterns") or {}).items():
        if isinstance(v, dict) and v.get("regex"):
            drops.append((k, re.compile(v["regex"], re.I)))
    src_country = {}
    srcs = cfg.get("sources") or {}
    is_root = lambda u: bool(re.match(r"^https?://[^/]+/?$", str(u or ""), re.I))
    for s in srcs.get("tier1_official") or []:
        if s.get("url") and s.get("country") and is_root(s["url"]):
            src_country[host_of(s["url"])] = s["country"]
    for g in (srcs.get("tier3_country_local") or {}).get("sources") or []:
        for u in g.get("urls") or []:
            if g.get("country") and is_root(u):
                src_country[host_of(u)] = g["country"]
    return {
        "action_en": at.get("en") or [], "action_incident": at.get("incident") or [], "action_local": local,
        "relevance": cfg.get("relevance_terms") or [], "drops": drops, "src_country": src_country,
    }


def strip_html(s):
    return re.sub(r"\s+", " ", htmlmod.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def judge_article(a, reg, rules, window_start, stats):
    """One article → list of risk_candidates rows (empty list = dropped).

    a: {"title", "link", "snippet", "pub" (datetime or None)}
    """
    stats["total"] += 1
    pub = a.get("pub")
    if window_start and pub and pub < window_start:
        stats["out_of_window"] += 1
        return []

    title = a.get("title") or ""
    body = (a.get("snippet") or "")[:2000]
    text = (title + " " + body).lower()
    lead = (title + " " + body[:500]).lower()     # the config gate looks at title + first paragraph only

    strong, weak = hits(text, DISRUPTION_STRONG), hits(text, DISRUPTION_WEAK)
    old_signal = bool(strong) or len(weak) >= 2

    # ① action word
    en_hit = any_term(lead, rules["action_en"])
    incident_hit = any_term(lead, rules["action_incident"])
    local_hit = any_term(lead, rules["action_local"])
    if not (en_hit or incident_hit or local_hit or old_signal):
        stats["no_disruption"] += 1
        return []

    # ② logistics relevance — tier 1 (official) sources are exempt
    t_hits = hits(text, TRANSPORT)
    if reg.get("tier") != 1 and not any_term(lead, rules["relevance"]) and not t_hits:
        stats["no_transport"] += 1
        return []

    # ③ drop patterns — title only
    drop_hit = [k for k, rx in rules["drops"] if rx.search(title)]
    if drop_hit:
        stats["dropped"] += 1
        stats["drop_by"][drop_hit[0]] = stats["drop_by"].get(drop_hit[0], 0) + 1
        return []

    # Country: ① title ② the source's country ③ first paragraph (only if exactly one)
    countries = detect_countries(title.lower())
    if not countries:
        sc = rules["src_country"].get(host_of(a.get("link")))
        if sc:
            countries = [sc]
    if not countries:
        bc = detect_countries(body[:500].lower())
        if len(bc) == 1:
            countries = bc
    modes = detect_modes(text, reg.get("channel"))
    dates = parse_event_dates(lead, pub)

    # Classification: protests also use category='strike'; the difference goes into sector and event_name
    if any(has(text, w) for w in STRIKE_WORDS):
        category, sector = "strike", "labour action"
    elif en_hit:
        category, sector = "strike", "civil unrest (protest/blockade)"
    elif local_hit:
        category, sector = "strike", "labour action or civil unrest [needs review]"
    else:
        category, sector = "incident", None
    event_name = title[:200]
    if sector and sector.startswith("civil unrest") and not re.search(r"protest|demonstrat|blockade|unrest|riot|rally", event_name, re.I):
        event_name = ("Protests — " + event_name)[:200]
    elif sector == "labour action" and not re.search(r"strike|walkout|industrial action|stoppage|lockout|picket|dispute", event_name, re.I):
        event_name = ("Strike — " + event_name)[:200]

    pub_iso = pub.isoformat() if pub else None
    out = []
    for c in (countries or [None]):
        out.append({
            "source_type": "fixed_url",
            "source_url": a.get("link"),
            "raw_title": title,
            "raw_snippet": (a.get("snippet") or "")[:500] or None,
            "category": category,
            "country": c,
            "region": None,
            "date_start": dates["start"],
            # No end date → leave it empty. The database marks the item "ongoing" and
            # extends the end date to today every hour (see docs/open-ended-events.md).
            "date_end": dates["end"],
            "date_raw": dates["raw"],
            "event_name": event_name,
            "sector": sector,
            "transport_mode": modes,
            "dedup_key": "|".join([c or "UNKNOWN", category, modes]),
            "source_tier": reg.get("tier", 3),
            "lifecycle_status": "announced",
            "mention_count": 1,
            "source_urls": [{"url": a.get("link"), "domain": reg.get("operator"), "seen_at": pub_iso}],
            "confidence": "low",
            "needs_review": True,
        })
        stats["kept"] += 1
    return out


# ── Italian MIT strike register ──────────────────────────────────────
MIT_URL = "https://scioperi.mit.gov.it/mit2/public/scioperi"
MIT_LABELS = ["Data inizio", "Data fine", "Sindacati", "Settore dello sciopero:", "Categoria dello sciopero:",
              "Modalità dello sciopero:", "Rilevanza dello sciopero:", "Note:", "Data proclamazione",
              "Regione:", "Provincia:", "Data ricezione:"]
MIT_MODE = {"aereo": "air", "ferroviario": "rail", "trasporto merci": "road,rail",
            "trasporto pubblico locale": "road", "marittimo": "sea", "autostrade": "road",
            "elicotteri": "air", "generale": "air,rail,road,sea", "plurisettoriale": "air,rail,road,sea"}
MIT_SKIP = ["trasporto pubblico locale", "elicotteri"]   # sectors far from freight


def parse_mit(page):
    def lines(block):
        s = re.sub(r"</(td|th|tr)>", "\n", block, flags=re.I)
        s = re.sub(r"<br\s*/?>", "\n", s, flags=re.I)
        s = re.sub(r"<[^>]+>", "\n", s)
        s = s.replace("&nbsp;", " ").replace("&amp;", "&")
        return [x for x in (re.sub(r"\s+", " ", t).strip() for t in s.split("\n")) if x]

    def field(ls, label):
        if label not in ls:
            return ""
        i = ls.index(label)
        if i + 1 >= len(ls):
            return ""
        v = ls[i + 1]
        return "" if v in MIT_LABELS else v

    def iso(d):
        m = re.match(r"^(\d{2})/(\d{2})/(\d{4})$", str(d or "").strip())
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else None

    def times(mod):
        m = re.search(r"DALLE\s*(\d{1,2})[.:](\d{2})\s*ALLE\s*(\d{1,2})[.:](\d{2})", mod or "", re.I)
        if not m:
            return None, None
        return f"{int(m.group(1)):02d}:{m.group(2)}", f"{int(m.group(3)):02d}:{m.group(4)}"

    out = []
    for block in re.split(r"<li[\s>]", page, flags=re.I):
        ls = lines(block)
        if "Data inizio" not in ls:
            continue
        settore = field(ls, "Settore dello sciopero:")
        key = settore.lower()
        if key in MIT_SKIP:
            continue
        ds = iso(field(ls, "Data inizio"))
        if not ds:
            continue
        de = iso(field(ls, "Data fine")) or ds
        categoria = field(ls, "Categoria dello sciopero:")
        sindacati = field(ls, "Sindacati")
        modalita = field(ls, "Modalità dello sciopero:")
        rilevanza = field(ls, "Rilevanza dello sciopero:")
        regione = field(ls, "Regione:")
        provincia = field(ls, "Provincia:")
        ts, te = times(modalita)
        modes = MIT_MODE.get(key, "unknown")
        region = regione if regione and regione.lower() != "italia" else None
        if region and provincia and provincia.lower() != "tutte":
            region = f"{region} · {provincia}"
        title = f"{categoria or 'Sciopero'} — {settore or '?'} strike, Italy"
        if sindacati:
            title += f" ({sindacati})"
        out.append({
            "source_type": "fixed_url", "source_url": MIT_URL,
            "raw_title": title[:200],
            "raw_snippet": " · ".join([f"Settore: {settore}", f"Categoria: {categoria}", f"Modalità: {modalita}",
                                       f"Rilevanza: {rilevanza}", f"Regione: {regione} / {provincia}",
                                       f"Sindacati: {sindacati}"])[:500],
            "category": "strike", "country": "Italy", "region": region,
            "date_start": ds, "date_end": de, "date_raw": field(ls, "Data inizio"),
            "time_start": ts, "time_end": te,
            "event_name": title[:200], "transport_mode": modes,
            "dedup_key": "|".join(["Italy", "strike", modes]),
            "source_tier": 1, "lifecycle_status": "announced", "mention_count": 1,
            "source_urls": [{"url": MIT_URL, "domain": "MIT (Italia)", "seen_at": None}],
            "confidence": "high", "needs_review": True,
        })
    return out


# ── De-duplication and merging ────────────────────────────────────────
def _overlaps(a, b):
    if not (a.get("date_start") and a.get("date_end") and b.get("date_start") and b.get("date_end")):
        return False
    return a["date_start"] <= b["date_end"] and a["date_end"] >= b["date_start"]


def _mode_overlap(a, b):
    A, B = str(a or "unknown").split(","), str(b or "unknown").split(",")
    return "unknown" in A or "unknown" in B or any(m in B for m in A)


def _mode_union(a, b):
    s = {x for x in str(a or "").split(",") + str(b or "").split(",") if x and x != "unknown"}
    return ",".join(sorted(s)) if s else "unknown"


def _same_event(x, c):
    return (x.get("dedup_key") and x["dedup_key"].split("|")[0] == c["dedup_key"].split("|")[0]
            and x.get("category") == c["category"]
            and _mode_overlap(x.get("transport_mode"), c["transport_mode"])
            and (_overlaps(x, c) or (not x.get("date_start") and not c.get("date_start"))))


def dedup(incoming, existing, today):
    """→ (inserts, updates)

    Known issue (2026-10-29, not changed yet): candidates whose country could not be
    determined share the key "UNKNOWN|…" and get merged into an older UNKNOWN candidate,
    even a rejected one, so they never appear as new items in the admin screen.
    """
    batch = []
    for c in incoming:
        if c.get("date_end") and c["date_end"] < today:
            continue                                      # already over → not stored
        twin = next((b for b in batch if _same_event(b, c)), None)
        if twin:
            if twin["source_url"] != c["source_url"]:
                twin["mention_count"] += 1
                twin["source_urls"] = (twin.get("source_urls") or []) + (c.get("source_urls") or [])
                twin["transport_mode"] = _mode_union(twin["transport_mode"], c["transport_mode"])
                twin["dedup_key"] = "|".join([twin.get("country") or "UNKNOWN", twin["category"], twin["transport_mode"]])
                if not twin.get("date_start") and c.get("date_start"):
                    twin["date_start"], twin["date_end"], twin["date_raw"] = c["date_start"], c["date_end"], c["date_raw"]
            continue
        batch.append(dict(c))

    now_iso = datetime.now(timezone.utc).isoformat()
    inserts, updates = [], []
    for c in batch:
        if any(e.get("source_url") and e["source_url"] == c["source_url"] for e in existing):
            continue                                      # exact same article → skip
        match = next((e for e in existing if _same_event(e, c)), None)
        cancel = bool(CANCEL.search((c.get("raw_title") or "") + " " + (c.get("raw_snippet") or "")))
        if match:
            mention = (match.get("mention_count") or 1) + 1
            merged = {
                "mention_count": mention,
                "last_seen_at": now_iso,
                "transport_mode": _mode_union(match.get("transport_mode"), c["transport_mode"]),
                "source_urls": (match.get("source_urls") or []) + (c.get("source_urls") or []),
                "date_start": match.get("date_start") or c.get("date_start"),
                "date_end": match.get("date_end") or c.get("date_end"),
                "date_raw": match.get("date_raw") or c.get("date_raw"),
                "country": match.get("country") or c.get("country"),
                "confidence": "high" if mention >= 3 else ("medium" if mention == 2 else "low"),
                "lifecycle_status": "cancelled" if cancel else (match.get("lifecycle_status") or "announced"),
                "needs_review": True if cancel else match.get("needs_review"),
            }
            merged["dedup_key"] = "|".join([merged["country"] or "UNKNOWN", match["category"], merged["transport_mode"]])
            updates.append((match["id"], merged))
        else:
            row = dict(c)
            row["last_seen_at"] = now_iso
            row["lifecycle_status"] = "cancelled" if cancel else "announced"
            inserts.append(row)
    return inserts, updates


def feed_articles(content):
    """RSS/Atom bytes → list of articles {title, link, snippet, pub}."""
    feed = feedparser.parse(content)
    out = []
    for en in feed.entries:
        t = en.get("published_parsed") or en.get("updated_parsed")
        pub = datetime(*t[:6], tzinfo=timezone.utc) if t else None
        body = en.get("summary") or (en.get("content") or [{}])[0].get("value", "")
        out.append({"title": en.get("title", ""), "link": en.get("link") or en.get("id"),
                    "snippet": strip_html(body), "pub": pub})
    return out


# ── Run ───────────────────────────────────────────────────────────────
def run():
    step("config fetch")
    rules = build_rules(get_config("wf1c_detection"))

    now = datetime.now(timezone.utc)
    window_start = now - timedelta(hours=WINDOW_HOURS)
    stats = {"total": 0, "out_of_window": 0, "no_disruption": 0, "no_transport": 0,
             "dropped": 0, "drop_by": {}, "kept": 0, "feed_fail": 0}
    candidates = []

    # MIT — a failure here must not stop the RSS sources
    step("MIT fetch")
    try:
        r = requests.get(MIT_URL, timeout=30)
        r.raise_for_status()
        mit = parse_mit(r.text)
        candidates += mit
        print(f"  MIT {len(mit)}")
    except Exception as e:
        log("warn", NAME, f"MIT fetch failed — collecting RSS only: {e}", node="MIT fetch")

    # RSS — one failing feed must not stop the others
    for reg in REGISTRY:
        step(f"RSS {reg['source_id']}")
        try:
            r = requests.get(reg["url"], timeout=30, headers={"User-Agent": "Mozilla/5.0 RiskCalendar"})
            r.raise_for_status()
            articles = feed_articles(r.content)
        except Exception as e:
            stats["feed_fail"] += 1
            log("warn", NAME, f"RSS failed {reg['source_id']}: {e}", node="RSS")
            continue
        for art in articles:
            candidates += judge_article(art, reg, rules, window_start, stats)
    print("  filter stats:", stats)

    step("existing candidates")
    existing = fetch_all("risk_candidates")

    step("dedup / merge")
    inserts, updates = dedup(candidates, existing, now.strftime("%Y-%m-%d"))
    print(f"  new {len(inserts)} / merged {len(updates)}")

    step("insert new")
    for row in inserts:
        db().table("risk_candidates").insert(row).execute()
    step("update existing")
    for cid, fields in updates:
        db().table("risk_candidates").update(fields).eq("id", cid).execute()
