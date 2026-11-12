"""Dev helper: clear play history and cached online rows for a clean demo."""
from __future__ import annotations

import sqlite3
from pathlib import Path

DB = Path(__file__).resolve().parent.parent / "data" / "music_hub.db"

conn = sqlite3.connect(DB)
try:
    conn.execute("DELETE FROM play_events")
    conn.execute("DELETE FROM tracks WHERE provider != 'local'")
    conn.commit()
    print("local tracks:", conn.execute("SELECT COUNT(*) FROM tracks WHERE provider='local'").fetchone()[0])
    print("online tracks:", conn.execute("SELECT COUNT(*) FROM tracks WHERE provider!='local'").fetchone()[0])
    print("events:", conn.execute("SELECT COUNT(*) FROM play_events").fetchone()[0])
finally:
    conn.close()
