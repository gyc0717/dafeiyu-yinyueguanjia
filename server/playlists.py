"""Local playlists in SQLite: list, detail, delete and QQ import."""
from __future__ import annotations

from . import online
from .db import connect, now_local
from .providers.base import OnlineTrack


def list_all() -> list[dict]:
    conn = connect()
    try:
        rows = conn.execute(
            """SELECT p.id, p.name, p.source, p.remote_id, p.created_at,
                      COUNT(pt.track_id) AS track_count
               FROM playlists p
               LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
               GROUP BY p.id
               ORDER BY p.created_at DESC, p.id DESC"""
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def get(playlist_id: int) -> dict | None:
    conn = connect()
    try:
        row = conn.execute("SELECT * FROM playlists WHERE id=?", (playlist_id,)).fetchone()
        if not row:
            return None
        tracks = conn.execute(
            """SELECT t.*, pt.position
               FROM playlist_tracks pt
               JOIN tracks t ON t.id = pt.track_id
               WHERE pt.playlist_id=?
               ORDER BY pt.position""",
            (playlist_id,),
        ).fetchall()
        return {"playlist": dict(row), "tracks": tracks}
    finally:
        conn.close()


def delete(playlist_id: int) -> bool:
    conn = connect()
    try:
        cur = conn.execute("DELETE FROM playlists WHERE id=?", (playlist_id,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def create(name: str, track_ids: list[int] | None = None) -> dict:
    """New empty local playlist (optionally seeded with tracks)."""
    conn = connect()
    try:
        cur = conn.execute(
            "INSERT INTO playlists(name, source, created_at) VALUES(?, 'local', ?)",
            (name, now_local()),
        )
        playlist_id = int(cur.lastrowid)
        if track_ids:
            conn.executemany(
                "INSERT OR IGNORE INTO playlist_tracks(playlist_id, track_id, position) VALUES(?,?,?)",
                [(playlist_id, track_id, index) for index, track_id in enumerate(_unique(track_ids))],
            )
        conn.commit()
        return {"playlist_id": playlist_id, "name": name, "tracks": len(track_ids or [])}
    finally:
        conn.close()


def rename(playlist_id: int, name: str) -> bool:
    conn = connect()
    try:
        cur = conn.execute("UPDATE playlists SET name=? WHERE id=?", (name, playlist_id))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def remove_tracks(playlist_id: int, track_ids: list[int]) -> int:
    """Drop tracks from one playlist; returns how many rows went away."""
    ids = _unique(track_ids)
    if not ids:
        return 0
    conn = connect()
    try:
        marks = ",".join("?" for _ in ids)
        cur = conn.execute(
            f"DELETE FROM playlist_tracks WHERE playlist_id=? AND track_id IN ({marks})",
            [playlist_id, *ids],
        )
        _normalize(conn, playlist_id)
        conn.commit()
        return max(0, cur.rowcount)
    finally:
        conn.close()


def reorder(playlist_id: int, track_ids: list[int]) -> bool:
    """Persist a new order; the id set must match what the playlist holds now."""
    ids = _unique(track_ids)
    conn = connect()
    try:
        current = {
            int(row["track_id"])
            for row in conn.execute(
                "SELECT track_id FROM playlist_tracks WHERE playlist_id=?", (playlist_id,)
            )
        }
        if not current or current != set(ids) or len(ids) != len(current):
            return False
        conn.executemany(
            "UPDATE playlist_tracks SET position=? WHERE playlist_id=? AND track_id=?",
            [(index, playlist_id, track_id) for index, track_id in enumerate(ids)],
        )
        conn.commit()
        return True
    finally:
        conn.close()


def save_copy(directory_id: str, name: str, track_ids: list[int]) -> dict:
    """Save a QQ playlist as an editable local copy (re-saving updates it)."""
    ids = _unique(track_ids)
    key = f"qq:{directory_id}"
    conn = connect()
    try:
        row = conn.execute(
            "SELECT id FROM playlists WHERE source='local' AND remote_id=?", (key,)
        ).fetchone()
        created = False
        if row:
            playlist_id = int(row["id"])
            # keep the user's own title once they renamed it
            stored = conn.execute("SELECT name FROM playlists WHERE id=?", (playlist_id,)).fetchone()
            name = str(stored["name"]) if stored else name
        else:
            cur = conn.execute(
                "INSERT INTO playlists(name, source, remote_id, created_at) VALUES(?, 'local', ?, ?)",
                (name, key, now_local()),
            )
            playlist_id = int(cur.lastrowid)
            created = True
        conn.execute("DELETE FROM playlist_tracks WHERE playlist_id=?", (playlist_id,))
        conn.executemany(
            "INSERT INTO playlist_tracks(playlist_id, track_id, position) VALUES(?,?,?)",
            [(playlist_id, track_id, index) for index, track_id in enumerate(ids)],
        )
        conn.commit()
        return {
            "playlist_id": playlist_id,
            "name": name,
            "saved": len(ids),
            "created": created,
            "source": "local",
        }
    finally:
        conn.close()


def _unique(ids: list[int]) -> list[int]:
    seen: set[int] = set()
    ordered: list[int] = []
    for track_id in ids:
        value = int(track_id)
        if value in seen:
            continue
        seen.add(value)
        ordered.append(value)
    return ordered


def _normalize(conn, playlist_id: int) -> None:
    """Close gaps left by removals so positions stay 0..n-1."""
    rows = conn.execute(
        "SELECT track_id FROM playlist_tracks WHERE playlist_id=? ORDER BY position",
        (playlist_id,),
    ).fetchall()
    conn.executemany(
        "UPDATE playlist_tracks SET position=? WHERE playlist_id=? AND track_id=?",
        [(index, playlist_id, int(row["track_id"])) for index, row in enumerate(rows)],
    )


def import_qq(directory_id: int, name: str, items: list[OnlineTrack]) -> dict:
    """Upsert the remote tracks, then replace the local playlist contents."""
    # online.upsert_tracks writes all remote rows in one transaction; do that
    # first, then touch the playlist rows (SQLite one writer at a time).
    all_ids = online.upsert_tracks(items)
    track_ids: list[int] = []
    seen: set[int] = set()
    for track_id in all_ids:
        if track_id in seen:
            continue
        seen.add(track_id)
        track_ids.append(track_id)

    conn = connect()
    try:
        now = now_local()
        row = conn.execute(
            "SELECT id FROM playlists WHERE source='qq' AND remote_id=?",
            (str(directory_id),),
        ).fetchone()
        if row:
            playlist_id = int(row["id"])
            conn.execute("UPDATE playlists SET name=? WHERE id=?", (name, playlist_id))
        else:
            cur = conn.execute(
                "INSERT INTO playlists(name, source, remote_id, created_at) VALUES(?, 'qq', ?, ?)",
                (name, str(directory_id), now),
            )
            playlist_id = int(cur.lastrowid)
        conn.execute("DELETE FROM playlist_tracks WHERE playlist_id=?", (playlist_id,))
        conn.executemany(
            "INSERT INTO playlist_tracks(playlist_id, track_id, position) VALUES(?,?,?)",
            [(playlist_id, track_id, position) for position, track_id in enumerate(track_ids)],
        )
        conn.commit()
        return {
            "playlist_id": playlist_id,
            "name": name,
            "imported": len(track_ids),
            "total": len(items),
            "duplicates": max(0, len(items) - len(track_ids)),
            "source": "qq",
        }
    finally:
        conn.close()
