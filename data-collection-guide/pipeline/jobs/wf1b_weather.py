"""wf1b — weather alerts. Reads meteoalarm feeds (37 countries) and keeps **Red** alerts only.

A quiet day with 0 rows is normal. Schedule: daily 07:00.
"""
import xml.etree.ElementTree as ET

import requests

from common.countries import COUNTRIES
from common.db import insert_rows
from common.log import log, step

NAME = "WF-1b 기상경보 수집"


def _local(tag):
    """'{namespace}onset' → 'onset'"""
    return tag.split("}")[-1]


def run():
    rows = []
    for _code, _iso, name, _group, meteo in COUNTRIES:
        if not meteo:
            continue
        step(f"weather feed {meteo}")
        url = f"https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-{meteo}"
        try:
            r = requests.get(url, timeout=30)
            r.raise_for_status()
            root = ET.fromstring(r.content)
        except Exception as e:
            log("warn", NAME, f"weather feed failed {meteo}: {e}", node="weather feed")
            continue

        for entry in root.iter():
            if _local(entry.tag) != "entry":
                continue
            f = {}
            for child in entry:
                f[_local(child.tag)] = (child.text or "").strip()

            # Colour comes from the first word of the title (cap:severity is unreliable)
            title = f.get("title", "")
            if (title.split(" ")[0] if title else "") != "Red":
                continue

            start = f.get("onset") or f.get("effective")
            end = f.get("expires")
            if not start or not end:
                continue
            rows.append({
                "event_type": "Weather",
                "country": name,
                "region": f.get("areaDesc"),
                "date_start": start.split("T")[0],
                "date_end": end.split("T")[0],
                "time_start": start.split("T")[1] if "T" in start else None,
                "time_end": end.split("T")[1] if "T" in end else None,
                "event_name": f.get("event"),
                "summary": title,
                "source_url": f.get("id"),
            })

    step("save raw_intake")
    insert_rows("raw_intake", rows)
    print(f"  Red alerts saved: {len(rows)}")
