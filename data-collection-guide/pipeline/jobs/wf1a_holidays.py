"""wf1a — public holidays. Reads the nager.at API for 42 countries and writes raw_intake.

Schedule: 1st of every month, 07:00. The same holidays are re-inserted monthly; wf2 merges them.
"""
from datetime import date

import requests

from common.countries import COUNTRIES
from common.db import insert_rows
from common.log import log, step

NAME = "WF-1a 공휴일 수집"

# Austrian state holidays kept even though their type is not Public/Bank
AT_EXTRA = {"Saint Joseph's Day", "Saint Florian's Day", "Saint Rupert's Day",
            "Saint Martin's Day", "Saint Leopold's Day"}


def run():
    year = date.today().year
    rows = []
    for _code, iso, name, _group, _meteo in COUNTRIES:
        step(f"holiday fetch {iso}")
        url = f"https://date.nager.at/api/v3/PublicHolidays/{year}/{iso}"
        try:
            r = requests.get(url, timeout=30)
            r.raise_for_status()
            items = r.json()
        except Exception as e:
            log("warn", NAME, f"holiday fetch failed {iso}: {e}", node="holiday fetch")
            continue

        for h in items:
            if h.get("countryCode") == "UA":      # Ukraine excluded (martial law)
                continue
            types = h.get("types") or []
            is_public = any(t in ("Public", "Bank") for t in types)
            is_at_extra = h.get("countryCode") == "AT" and h.get("name") in AT_EXTRA
            if not (is_public or is_at_extra):
                continue
            rows.append({
                "event_type": "Bank Holiday",
                "country": name,
                "region": ",".join(h["counties"]) if h.get("counties") else None,
                "date_start": h["date"],
                "date_end": h["date"],
                "event_name": h["name"],
                "summary": f'{h["name"]} ({h.get("localName")})',
                "source_url": url,
            })

    step("save raw_intake")
    insert_rows("raw_intake", rows)
    print(f"  holidays saved: {len(rows)}")
