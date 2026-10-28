"""wf1e driving-ban supplement test — runs on the saved widget page of 2026-10-28
and the database state of that day. No internet, no key.

    python -m tests.test_wf1e
"""
import os
import sys

from jobs.wf1e_driving_ban_supplement import SRC_PREFIX, build_rows, existing_windows, parse_box

HTML = os.path.join(os.path.dirname(__file__), "fixtures", "trafficban_box_20261028.html")
TODAY = "2026-10-28"

# Driving bans already in events on 2026-10-28 (28 Oct – 7 Nov)
EVENTS = [
    {"country": "Czechia", "date_start": "2026-10-28", "date_end": "2026-10-28", "time_start": "13:00:00", "time_end": "22:00:00"},
    {"country": "Austria", "date_start": "2026-10-31", "date_end": "2026-10-31", "time_start": "15:00:00", "time_end": "24:00:00"},
    {"country": "Germany", "date_start": "2026-10-31", "date_end": "2026-10-31", "time_start": "00:00:00", "time_end": "22:00:00"},
    {"country": "Slovenia", "date_start": "2026-10-31", "date_end": "2026-10-31", "time_start": "08:00:00", "time_end": "22:00:00"},
    {"country": "France", "date_start": "2026-11-02", "date_end": "2026-11-02", "time_start": "06:00:00", "time_end": "10:00:00"},
    {"country": "Austria", "date_start": "2026-11-07", "date_end": "2026-11-07", "time_start": "15:00:00", "time_end": "24:00:00"},
]

results = []


def check(name, cond):
    results.append(bool(cond))
    print(f"{'✅' if cond else '❌'} {name}")


def main():
    with open(HTML, encoding="utf-8") as f:
        html = f.read()
    bans = parse_box(html)

    dates = sorted({b["date"] for b in bans})
    check("11 days read (28 Oct – 7 Nov)", dates[0] == "2026-10-28" and dates[-1] == "2026-11-07" and len(dates) == 11)
    check("no garbage country names", all(b["country"] for b in bans))
    check("Czech Republic → Czechia", all(b["country"] == "Czechia" for b in bans if b["country_raw"] == "Czech Republic"))

    rows, info = build_rows(bans, TODAY, existing_windows(EVENTS))
    got = sorted((r["country"], r["date_start"], r["time_start"], r["time_end"]) for r in rows)
    check("exactly the 4 missing daytime bans", got == [
        ("Croatia", "2026-10-30", "15:00", "23:00"),
        ("Croatia", "2026-10-31", "15:00", "23:00"),
        ("Greece", "2026-10-28", "16:00", "23:00"),
        ("Poland", "2026-10-31", "18:00", "22:00"),
    ])
    check("Sundays and night-only skipped", info["skipped_sunday"] > 0 and info["skipped_night"] > 0
          and not any(r["date_start"] == "2026-11-01" for r in rows))
    check("existing countries/dates untouched", not any(r["country"] in ("Germany", "Slovenia", "Czechia", "Austria") for r in rows))
    check("source links point to trafficban.com", all(r["source_url"].startswith(SRC_PREFIX) for r in rows))

    rows2, _ = build_rows(bans, TODAY, existing_windows(EVENTS + rows))
    check("re-run with own rows present adds nothing (no delete needed)", rows2 == [])

    ev = EVENTS + [{"country": "Poland", "date_start": "2026-10-31", "date_end": "2026-10-31",
                    "time_start": "19:00:00", "time_end": "21:00:00"}]
    rows3, info3 = build_rows(bans, TODAY, existing_windows(ev))
    check("time mismatch reported, not written", not any(r["country"] == "Poland" for r in rows3) and len(info3["mismatch"]) == 1)

    try:
        parse_box("<html><body>blocked</body></html>")
        check("changed page layout raises", False)
    except RuntimeError:
        check("changed page layout raises", True)

    print(f"\nresult: {sum(results)}/{len(results)} {'PASS' if all(results) else 'FAIL'}")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
