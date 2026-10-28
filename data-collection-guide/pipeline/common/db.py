"""Supabase connection and read/write helpers.

- fetch_all   reads a whole table, 1000 rows at a time (Supabase returns at most 1000 per request)
- insert_rows inserts many rows in chunks of 500
"""
import os

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
_client = None


def db():
    """Create the Supabase client once and reuse it."""
    global _client
    if _client is None:
        _client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])
    return _client


def fetch_all(table, where=None, order="id", columns="*", page=1000):
    """Read a table to the end.

    ⚠️ Supabase returns at most 1000 rows per request. Without paging the result is
    silently cut at 1000 rows.

    where: a function that adds filters, e.g. lambda q: q.eq("event_type", "Bank Holiday")
    order: a stable sort column so pages do not overlap (events → event_id, config → key)
    """
    rows, start = [], 0
    while True:
        q = db().table(table).select(columns)
        if where:
            q = where(q)
        res = q.order(order).range(start, start + page - 1).execute()
        rows.extend(res.data)
        if len(res.data) < page:
            return rows
        start += page


def _same_keys(rows):
    """For a bulk insert every row must have the same columns (missing ones become None)."""
    keys = []
    for r in rows:
        for k in r:
            if k not in keys:
                keys.append(k)
    return [{k: r.get(k) for k in keys} for r in rows]


def insert_rows(table, rows, chunk=500):
    """Insert rows in chunks of 500."""
    for i in range(0, len(rows), chunk):
        db().table(table).insert(_same_keys(rows[i:i + chunk])).execute()
