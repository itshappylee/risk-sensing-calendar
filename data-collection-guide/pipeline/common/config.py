"""Read the config table. Rules live in config rows, not in code."""
import json

from common.db import db


def get_config(key, required=True):
    res = db().table("config").select("value").eq("key", key).execute()
    if not res.data:
        if required:
            raise RuntimeError(f"config.{key} is missing")
        return None
    value = res.data[0]["value"]
    return json.loads(value) if isinstance(value, str) else value
