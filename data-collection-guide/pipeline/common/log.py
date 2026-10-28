"""ops_log records — heartbeat, warnings, errors.

The monitoring job (wf0b) and config.expected_coverage look rows up by the exact
ops_log.workflow name, so the names in run.py are fixed identifiers. Do not translate
or rename them.
"""
from common.db import db

# Step currently running. On failure it goes into ops_log.node so you can see where it stopped.
CURRENT = {"step": None, "run_id": None}


def step(name):
    """Call when a job moves to a new step, e.g. step("MIT fetch")."""
    CURRENT["step"] = name
    print(f"  · {name}")


def log(level, workflow, message, node=None, details=None):
    row = {
        "level": level,
        "workflow": workflow,
        "message": str(message)[:500],
        "node": node,
        "execution_id": CURRENT["run_id"],
        "details": details,
    }
    db().table("ops_log").insert(row).execute()


# Stored heartbeat text. Kept as-is because existing monitoring rows use it.
HEARTBEAT_MESSAGE = "실행 시작"


def heartbeat(workflow):
    """'Run started' record. The watchdog decides a job is alive from these rows."""
    log("info", workflow, HEARTBEAT_MESSAGE)
