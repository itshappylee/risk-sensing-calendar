"""Entry point.

    python run.py wf1c          # one job
    python run.py hourly        # hourly group (wf1c → wf2c → wf2, in that order)

Every job writes a heartbeat when it starts and an error row in ops_log if it fails.
If one job in a group fails, the next one still runs.
"""
import sys
import traceback
from datetime import datetime, timezone

from common.log import CURRENT, heartbeat, log
from jobs import (wf0b_watchdog, wf1a_holidays, wf1b_weather, wf1c_strikes, wf1d_driving_ban,
                  wf1e_driving_ban_supplement, wf2_validate, wf2c_promote)

# key: (function, ops_log workflow name)
# ⚠️ The names are fixed identifiers. config.expected_coverage and the dashboard look rows up by
#    these exact strings (they are stored in Korean). Do not translate or rename them.
JOBS = {
    "wf1a": (wf1a_holidays.run, "WF-1a 공휴일 수집"),             # public holidays
    "wf1b": (wf1b_weather.run, "WF-1b 기상경보 수집"),            # weather alerts
    "wf1c": (wf1c_strikes.run, "WF-1c 파업·Incident 수집"),       # strikes / incidents / protests
    "wf1d": (wf1d_driving_ban.run, "WF-1d 운행금지 산출"),        # truck driving bans (rule table)
    "wf1e": (wf1e_driving_ban_supplement.run, "WF-1e 운행금지 보충"),  # driving bans (supplement)
    "wf2c": (wf2c_promote.run, "WF-2c 승인·승격"),               # promote approved candidates
    "wf2": (wf2_validate.run, "WF-2 검증·판정·저장"),             # roll-up, scoring, save to events
    "wf0b": (wf0b_watchdog.run, "WF-0b 조용한 실패 감지"),        # silent-failure watchdog
}

# Order matters: collect → promote → save.
GROUPS = {
    "hourly": ["wf1c", "wf2c", "wf2"],
}


def run_one(key):
    fn, name = JOBS[key]
    CURRENT["run_id"] = f"py-{datetime.now(timezone.utc):%Y%m%dT%H%M%S}-{key}"
    CURRENT["step"] = None
    print(f"▶ {name}")
    try:
        heartbeat(name)
    except Exception as e:  # a failed heartbeat must not stop the job itself
        print(f"  heartbeat failed: {e}")
    try:
        fn()
        print(f"✔ {name}")
        return True
    except Exception as e:
        stack = traceback.format_exc()
        print(stack)
        try:
            log("error", name, str(e), node=CURRENT["step"],
                details={"error_name": type(e).__name__, "stack": " | ".join(stack.strip().splitlines()[-3:])[:800]})
        except Exception as e2:
            print(f"  could not record the error either: {e2}")
        return False


def main():
    if len(sys.argv) < 2:
        print("usage: python run.py <" + "|".join(list(JOBS) + list(GROUPS)) + ">")
        sys.exit(2)
    arg = sys.argv[1]
    keys = GROUPS.get(arg, [arg])
    for k in keys:
        if k not in JOBS:
            print(f"unknown job: {k}")
            sys.exit(2)
    ok = [run_one(k) for k in keys]
    sys.exit(0 if all(ok) else 1)


if __name__ == "__main__":
    main()
