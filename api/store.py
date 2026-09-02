"""
Where the records come from.

One module touches storage, and this is it. The API asks `read("seed_assets.json")` and
gets a list of dicts; whether those came out of Supabase or off the disk is this file's
business and nobody else's. That separation was claimed in the architecture from the
start — this is the file that makes the claim true.

    DATABASE_URL set   -> Supabase (PostgreSQL), read once at startup
    DATABASE_URL unset -> the JSON seeds, exactly as before

Two things make the swap safe enough to demo on:

  1. Every table stores the original record in a `payload` JSONB column, so what comes
     back out is what went in. No column widening, no date parsed into a different
     shape, no field silently dropped. Postgres and JSON return identical records, and
     `verify()` proves it rather than asserting it.

  2. If the database is configured but unreachable — wrong password, paused project,
     venue wifi — this falls back to the JSON seeds and says so loudly on stdout. A
     database being down must never be the reason a demo fails.
"""
from __future__ import annotations

import json
import os
import pathlib
from typing import Any

DATA = pathlib.Path(__file__).resolve().parent.parent / "data"

# Which table each seed file lives in, and the column to order by so the rows come back
# in a stable, meaningful order rather than whatever Postgres feels like.
TABLES: dict[str, tuple[str, str]] = {
    "seed_assets.json":        ("assets", "equipment_id"),
    "seed_telemetry.json":     ("telemetry", "equipment_id, reading_at"),
    "seed_events.json":        ("events", "occurred_at, event_id"),
    "seed_bookings.json":      ("bookings", "booking_id"),
    "catalogue_skus.json":     ("catalogue_skus", "product_key"),
    "catalogue_branches.json": ("catalogue_branches", "store_id"),
    "catalogue_customers.json": ("catalogue_customers", "id"),
}

DATABASE_URL = os.getenv("DATABASE_URL")
_backend = "json"
_cache: dict[str, list] = {}


def _from_disk(name: str) -> list:
    path = DATA / name
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


def _load_all_from_db() -> dict[str, list] | None:
    """Pull every table in one connection, or give up and let the caller use disk."""
    try:
        import psycopg2
    except ImportError:
        print("[store] DATABASE_URL is set but psycopg2 is not installed — using JSON seeds")
        return None

    try:
        conn = psycopg2.connect(DATABASE_URL, connect_timeout=8)
    except Exception as exc:                                   # noqa: BLE001
        print(f"[store] could not reach the database ({exc.__class__.__name__}) — using JSON seeds")
        return None

    out: dict[str, list] = {}
    try:
        with conn, conn.cursor() as cur:
            for name, (table, order) in TABLES.items():
                # The payload column is the record as the API produced it, so reading it
                # back cannot drift from what the JSON seeds would have given.
                cur.execute(f"select payload from {table} order by {order}")
                out[name] = [r[0] for r in cur.fetchall()]
    except Exception as exc:                                   # noqa: BLE001
        print(f"[store] database read failed ({exc}) — using JSON seeds")
        return None
    finally:
        conn.close()

    if not out.get("seed_assets.json"):
        print("[store] the database is reachable but empty — using JSON seeds. "
              "Run:  python db/load_supabase.py")
        return None
    return out


def init() -> str:
    """Decide the backend once, at import. Returns 'supabase' or 'json'."""
    global _backend, _cache
    if not DATABASE_URL:
        _backend = "json"
        return _backend

    rows = _load_all_from_db()
    if rows is None:
        _backend = "json"
        return _backend

    _cache = rows
    _backend = "supabase"
    total = sum(len(v) for v in rows.values())
    print(f"[store] reading from Supabase (PostgreSQL) — {total:,} rows across "
          f"{len(rows)} tables")
    return _backend


def read(name: str) -> list:
    """The one call the rest of the API makes. Shape is identical either way."""
    if _backend == "supabase" and name in _cache:
        return _cache[name]
    return _from_disk(name)


def backend() -> str:
    return _backend


def describe() -> dict[str, Any]:
    """Shown on /health, so the demo can prove which store it is actually using."""
    if _backend != "supabase":
        return {"backend": "json", "detail": "JSON seed files (no DATABASE_URL set)"}
    host = ""
    if DATABASE_URL and "@" in DATABASE_URL:
        host = DATABASE_URL.split("@", 1)[1].split("/", 1)[0]      # never the password
    return {
        "backend": "supabase",
        "detail": "PostgreSQL via Supabase",
        "host": host,
        "tables": {TABLES[k][0]: len(v) for k, v in _cache.items()},
    }


def verify() -> dict[str, Any]:
    """Prove Postgres and the JSON seeds return the same records, rather than claim it."""
    if _backend != "supabase":
        return {"checked": False, "reason": "not reading from the database"}
    result: dict[str, Any] = {"checked": True, "tables": {}}
    for name in TABLES:
        disk, db = _from_disk(name), _cache.get(name, [])
        result["tables"][name] = {
            "json_rows": len(disk),
            "db_rows": len(db),
            "identical": disk == db,
        }
    result["all_identical"] = all(t["identical"] for t in result["tables"].values())
    return result
