"""wf0b — silent-failure watchdog. Finds jobs that did not fail loudly but simply did not run.

Judged by heartbeats (ops_log 'run started' rows), not by row counts: a day with 0 new rows
is normal when sources are quiet. Expectations live in config.expected_coverage.workflows:
  heartbeat_max_age_h  → warn when the last heartbeat is older than this (any cadence)
  min_countries        → warn when raw_intake covers fewer countries than this

The ops_log look-back is 200 hours, longer than the weekly job's 176-hour limit; otherwise a
weekly job would always look "never ran" (fixed 2026-10-28).
New jobs (e.g. wf1e, 26 h) are picked up automatically from config.
"""
from datetime import datetime, timedelta, timezone

from common.config import get_config
from common.db import fetch_all, insert_rows
from common.log import step

NAME = "WF-0b 조용한 실패 감지"
LOOKBACK_H = 200


def check(grid, logs, raw_rows, now):
    out = []
    for name, rule in grid.items():
        if not isinstance(rule, dict):
            continue
        max_age = rule.get("heartbeat_max_age_h")
        if max_age is not None:
            beats = [datetime.fromisoformat(r["ts"].replace("Z", "+00:00"))
                     for r in logs if r.get("level") == "info" and r.get("workflow") == name]
            if not beats:
                out.append({"level": "warn", "workflow": name,
                            "message": f"silent failure suspected — no heartbeat at all in the last {LOOKBACK_H} h",
                            "details": {"expected_cadence": rule.get("cadence"), "max_age_h": max_age, "note": rule.get("note")}})
            else:
                age_h = (now - max(beats)).total_seconds() / 3600
                if age_h > float(max_age):
                    out.append({"level": "warn", "workflow": name,
                                "message": f"silent failure suspected — last run {age_h:.1f} h ago (expected within {max_age} h)",
                                "details": {"last_heartbeat_h_ago": round(age_h, 1), "max_age_h": max_age, "note": rule.get("note")}})

        if rule.get("min_countries") and rule.get("coverage_table") == "raw_intake":
            et = rule.get("coverage_event_type")
            got = len({r["country"] for r in raw_rows if r.get("country") and (not et or r.get("event_type") == et)})
            if got < int(rule["min_countries"]):
                out.append({"level": "warn", "workflow": name,
                            "message": f"coverage below target — {et or 'all'} from {got} countries (expected ≥ {rule['min_countries']})",
                            "details": {"got": got, "expected": rule["min_countries"], "note": rule.get("note")}})
    return out


def run():
    step("config")
    grid = (get_config("expected_coverage") or {}).get("workflows") or {}
    now = datetime.now(timezone.utc)
    step("ops_log")
    since = (now - timedelta(hours=LOOKBACK_H)).isoformat()
    logs = fetch_all("ops_log", where=lambda q: q.gt("ts", since), columns="ts,level,workflow")
    step("raw_intake")
    raw_rows = fetch_all("raw_intake", columns="id,country,event_type")

    step("compare with expectations")
    warnings = check(grid, logs, raw_rows, now)
    print(f"  rules {len(grid)} / warnings {len(warnings)}")
    if warnings:                           # nothing is written when all is well, so real warnings stand out
        step("write warnings")
        insert_rows("ops_log", warnings)
