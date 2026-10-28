"""wf1c judging test — real false positives and true cases from the 2026-10-22 audit,
plus the Turkish border-crossing case from 2026-10-29.

    python -m tests.test_wf1c           (reads the live config.wf1c_detection from Supabase)
    python -m tests.test_wf1c --offline (uses FIXTURE below — no internet, no key)

All cases must pass. Run it again after every change to config.wf1c_detection.
"""
import sys
from datetime import datetime, timezone

from jobs.wf1c_strikes import REGISTRY, build_rules, host_of, judge_article

EDIRNE = "https://www.edirneahval.com/edirne-haberler/hamzabeyli-sinir-kapisinda-tir-soforlerinden-eylem/105699"

# (expected, title, snippet, link, expected country or None)
CASES = [
    ("drop", "A.P. Moller Capital strikes deal for Euroports majority", "", None, None),
    ("drop", "Hormuz claims two more ships in fresh wave of strikes", "", None, None),
    ("drop", "'New MSC' buy – building a Military Shipping Company unit?", "", None, None),
    ("drop", "UK ports hit back at Brussels over ETS diversion claims", "", None, None),
    ("keep", "Piraeus dockworkers (ENEDEP) and Attica metalworkers strike — port and ship-repair", "", None, None),
    ("keep", "French ports industrial action (all ports)", "", None, "France"),
    ("keep", "Freight train derailment at Meja near Rijeka — line closed for days", "", None, None),
    ("keep", "Protesta bllokon qarkullimin, rëndohet trafiku në Tiranë", "", None, None),
    # 2026-10-29 — Turkish local news; country comes from the source (Edirne → Turkey)
    ("keep", "Hamzabeyli Sınır Kapısı'nda Tır Şoförlerinden Eylem",
     "Hamzabeyli Sınır Kapısı'nda tır şoförleri, sorunlarına dikkati çekmek için eylem yaparak sınır kapısını geçişlere kapattı.",
     EDIRNE, "Turkey"),
    ("drop", "Dereköy Sınır Kapısı'nda 40 Kilo Metamfetamin Ele Geçirildi!", "", "https://www.edirneahval.com/x/1", None),
]

# The judging part of config.wf1c_detection (copy of 2026-10-29). Production reads Supabase.
FIXTURE = {
    "action_terms": {
        "en": ["strike", "walkout", "work stoppage", "industrial action", "stoppage", "protest", "demonstration",
               "blockade", "roadblock", "road block", "riot", "unrest", "picket", "sit-in", "go-slow",
               "mobilisation", "mobilization", "rally", "march"],
        "incident": ["derailment", "accident", "collision", "crash", "landslide", "flood"],
        "local": {"sq": ["protestë", "protesta", "bllokim", "bllokojnë", "bllokohen", "grevë"],
                  "fr": ["grève", "manifestation", "blocage", "mobilisation"],
                  "it": ["sciopero", "manifestazione", "blocco", "presidio", "corteo"],
                  "tr": ["eylem", "grev", "protesto", "kontak kapattı", "kontak kapattılar", "oturma eylemi",
                         "abluka", "yolu kapattı"]},
    },
    "relevance_terms": ["road", "motorway", "highway", "ring road", "border", "crossing", "port", "terminal", "dock",
                        "quay", "rail", "railway", "line closed", "airport", "fuel", "depot", "haulage", "freight",
                        "cargo", "lorry", "truck", "traffic", "closed", "blocked", "suspended", "cancelled", "delays",
                        "queues", "public transport", "rrugë", "trafik", "autostrada", "frontière", "péage", "porto",
                        "ferrovia", "granica", "prechod",
                        "tır", "tir", "kamyon", "sınır kapısı", "sinir kapisi", "gümrük", "geçiş", "liman", "otoyol"],
    "drop_patterns": {
        "corporate_news": {"regex": r"\b(acquires?|acquisition|buys?|buyout|majority stake|merger|IPO|newbuild|orders? \d+ vessels?|launches? (new )?service|appoints?|results|earnings|profit|revenue)\b"},
        "policy_opinion": {"regex": r"\b(hits? back|calls? for|urges?|warns? (of|over)|concerned over|claims?|criticis|slams?|welcomes?|proposals?|consultation)\b"},
        "strike_as_verb": {"regex": r"strikes?\s+(a\s+)?(deal|agreement|bargain|accord|pact|partnership|contract)"},
        "military_strike": {"regex": r"(air|missile|drone|tanker|military|retaliatory|precision)[- ]strikes?|strikes?\s+on\s+(targets?|positions?)|wave of strikes|series of attacks"},
    },
    "sources": {"tier3_country_local": {"sources": [{"urls": ["https://www.edirneahval.com"], "country": "Turkey"}]}},
}


def reg_for(link):
    h = host_of(link)
    return next((r for r in REGISTRY if host_of(r["url"]) == h), REGISTRY[0])


def main():
    if "--offline" in sys.argv:
        cfg = FIXTURE
    else:
        from common.config import get_config
        cfg = get_config("wf1c_detection")
    rules = build_rules(cfg)
    now = datetime.now(timezone.utc)
    passed = 0
    print(f"{'#':<3}{'want':<6}{'got':<6}{'ok':<4} title / class")
    for i, (want, title, snippet, link, country) in enumerate(CASES, 1):
        link = link or f"https://example.test/{i}"
        stats = {"total": 0, "out_of_window": 0, "no_disruption": 0, "no_transport": 0, "dropped": 0, "drop_by": {}, "kept": 0}
        rows = judge_article({"title": title, "link": link, "snippet": snippet, "pub": now}, reg_for(link), rules, None, stats)
        got = "keep" if rows else "drop"
        ok = got == want and (country is None or (rows and rows[0]["country"] == country))
        passed += ok
        why = (f"{rows[0]['category']} / {rows[0]['sector']} / {rows[0]['country']}" if rows
               else next(k for k in ("no_disruption", "no_transport", "dropped") if stats[k]) + (f" {stats['drop_by']}" if stats["drop_by"] else ""))
        print(f"{i:<3}{want:<6}{got:<6}{'✅' if ok else '❌':<4} {title[:60]}\n{'':<19}→ {why}")
    print(f"\nresult: {passed}/{len(CASES)} {'PASS' if passed == len(CASES) else 'FAIL — do not deploy this config'}")
    sys.exit(0 if passed == len(CASES) else 1)


if __name__ == "__main__":
    main()
