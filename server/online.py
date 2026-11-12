"""Persist online search results into the same tracks table.

Keeping one table means the queue, play journal, lyrics and cover endpoints all
work for online tracks without a parallel data model.
"""
from __future__ import annotations

from .db import connect, now_local
from .providers.base import OnlineTrack
from .works import work_key


def upsert_tracks(items: list[OnlineTrack]) -> list[int]:
    """Insert/update many online tracks in one transaction; return ids in order."""
    conn = connect()
    try:
        ids: list[int] = []
        now = now_local()
        for item in items:
            row = conn.execute(
                "SELECT id FROM tracks WHERE provider=? AND provider_id=?",
                (item.provider, item.provider_id),
            ).fetchone()
            if row:
                conn.execute(
                    """UPDATE tracks SET title=?, artist=?, album=?, duration_ms=?,
                       cover=?, format=?, updated_at=?, work_key=? WHERE id=?""",
                    (
                        item.title,
                        item.artist,
                        item.album,
                        item.duration_ms,
                        item.cover_url,
                        item.format,
                        now,
                        work_key(item.title, item.artist),
                        row["id"],
                    ),
                )
                ids.append(int(row["id"]))
            else:
                cur = conn.execute(
                    """INSERT INTO tracks(provider, provider_id, title, artist, album,
                       duration_ms, path, cover, lyrics, lyrics_path, fingerprint,
                       format, mtime, size, added_at, updated_at, work_key)
                       VALUES(?,?,?,?,?,?, '', ?, NULL, NULL, NULL, ?, 0, 0, ?, ?, ?)""",
                    (
                        item.provider,
                        item.provider_id,
                        item.title,
                        item.artist,
                        item.album,
                        item.duration_ms,
                        item.cover_url,
                        item.format,
                        now,
                        now,
                        work_key(item.title, item.artist),
                    ),
                )
                ids.append(int(cur.lastrowid))
        conn.commit()
        return ids
    finally:
        conn.close()


def upsert_track(item: OnlineTrack) -> int:
    return upsert_tracks([item])[0]
