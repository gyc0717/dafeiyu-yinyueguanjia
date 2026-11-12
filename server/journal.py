"""Listening journal: one row per play attempt, progress folded in place."""
from __future__ import annotations

from .db import connect, now_local


def start_event(track_id: int, source: str = "web", position_ms: int = 0) -> int:
    conn = connect()
    try:
        cur = conn.execute(
            "INSERT INTO play_events(track_id, started_at, played_ms, source, completed) VALUES(?,?,?,?,0)",
            (track_id, now_local(), max(0, int(position_ms)), source),
        )
        conn.commit()
        return int(cur.lastrowid)
    finally:
        conn.close()


def progress_event(event_id: int, played_ms: int, position_ms: int | None = None) -> bool:
    conn = connect()
    try:
        cur = conn.execute(
            "UPDATE play_events SET played_ms=MAX(played_ms, ?) WHERE id=? AND ended_at IS NULL",
            (max(0, int(played_ms)), event_id),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def end_event(event_id: int, played_ms: int, completed: bool | None = None) -> bool:
    conn = connect()
    try:
        row = conn.execute(
            "SELECT e.played_ms, t.duration_ms FROM play_events e "
            "JOIN tracks t ON t.id=e.track_id WHERE e.id=?",
            (event_id,),
        ).fetchone()
        if not row:
            return False
        played = max(int(played_ms or 0), int(row["played_ms"] or 0))
        duration = int(row["duration_ms"] or 0)
        if completed is None:
            completed = bool(duration and played >= duration * 0.85)
        cur = conn.execute(
            "UPDATE play_events SET ended_at=?, played_ms=?, completed=? WHERE id=?",
            (now_local(), played, 1 if completed else 0, event_id),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def close_open_events() -> int:
    """服务启动时收起上次异常退出留下的未闭合事件，避免统计里出现永远“正在播放”。"""
    conn = connect()
    try:
        cur = conn.execute(
            "UPDATE play_events SET ended_at=? WHERE ended_at IS NULL",
            (now_local(),),
        )
        conn.commit()
        return cur.rowcount
    finally:
        conn.close()


def recent(limit: int = 30) -> list[dict]:
    conn = connect()
    try:
        rows = conn.execute(
            """SELECT t.*, MAX(e.started_at) AS last_played_at, COUNT(e.id) AS plays
               FROM play_events e JOIN tracks t ON t.id = e.track_id
               WHERE e.played_ms >= 3000 OR e.completed = 1
               GROUP BY t.id
               HAVING plays > 0
               ORDER BY last_played_at DESC
               LIMIT ?""",
            (limit,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def stats_today() -> dict:
    conn = connect()
    try:
        row = conn.execute(
            """SELECT COUNT(*) AS plays,
                      COALESCE(SUM(played_ms),0) AS played_ms,
                      COUNT(DISTINCT track_id) AS tracks
               FROM play_events
               WHERE date(started_at) = date('now','localtime')
                 AND (played_ms >= 3000 OR completed = 1)"""
        ).fetchone()
        return dict(row)
    finally:
        conn.close()


def stats_week(days: int = 7) -> dict:
    """Last N days (today included) for the weekly report."""
    days = max(1, min(31, int(days)))
    conn = connect()
    try:
        rows = conn.execute(
            """SELECT date(started_at) AS day,
                      COUNT(*) AS plays,
                      COALESCE(SUM(played_ms),0) AS played_ms,
                      COUNT(DISTINCT track_id) AS tracks
               FROM play_events
               WHERE date(started_at) >= date('now','localtime', ?)
                 AND (played_ms >= 3000 OR completed = 1)
               GROUP BY day
               ORDER BY day""",
            (f"-{days - 1} days",),
        ).fetchall()
        by_day = {row["day"]: dict(row) for row in rows}
        series = []
        for offset in range(days - 1, -1, -1):
            day = conn.execute(
                "SELECT date('now','localtime', ?) AS d", (f"-{offset} days",)
            ).fetchone()["d"]
            item = by_day.get(day) or {"day": day, "plays": 0, "played_ms": 0, "tracks": 0}
            series.append(
                {
                    "day": day,
                    "plays": int(item["plays"] or 0),
                    "played_ms": int(item["played_ms"] or 0),
                    "tracks": int(item["tracks"] or 0),
                }
            )
        top_tracks = [
            dict(row)
            for row in conn.execute(
                """SELECT t.id, t.title, t.artist, COUNT(*) AS plays,
                          COALESCE(SUM(e.played_ms),0) AS played_ms
                   FROM play_events e JOIN tracks t ON t.id = e.track_id
                   WHERE date(e.started_at) >= date('now','localtime', ?)
                     AND (e.played_ms >= 3000 OR e.completed = 1)
                   GROUP BY t.id
                   ORDER BY plays DESC, played_ms DESC
                   LIMIT 5""",
                (f"-{days - 1} days",),
            )
        ]
        top_artists = [
            dict(row)
            for row in conn.execute(
                """SELECT COALESCE(NULLIF(t.artist,''),'未知歌手') AS artist,
                          COUNT(*) AS plays
                   FROM play_events e JOIN tracks t ON t.id = e.track_id
                   WHERE date(e.started_at) >= date('now','localtime', ?)
                     AND (e.played_ms >= 3000 OR e.completed = 1)
                   GROUP BY artist
                   ORDER BY plays DESC
                   LIMIT 5""",
                (f"-{days - 1} days",),
            )
        ]
        totals = {
            "plays": sum(item["plays"] for item in series),
            "played_ms": sum(item["played_ms"] for item in series),
            "tracks": len({row["id"] for row in top_tracks}) or 0,
            "days": len([item for item in series if item["plays"]]),
        }
        return {
            "days": days,
            "series": series,
            "totals": totals,
            "top_tracks": top_tracks,
            "top_artists": top_artists,
        }
    finally:
        conn.close()


def library_duplicates(limit: int = 60) -> dict:
    """Read-only tidy-up check: same normalized title + artist in the local library."""
    conn = connect()
    try:
        rows = conn.execute(
            """SELECT id, title, artist, album, duration_ms, format, path
               FROM tracks WHERE provider='local' ORDER BY title"""
        ).fetchall()
    finally:
        conn.close()

    def key_of(row) -> str:
        def norm(text: str) -> str:
            text = (text or "").lower()
            for ch in " （）()[]【】《》<>-_.·,，.!！?？'\"“”":
                text = text.replace(ch, "")
            return " ".join(text.split())

        return f"{norm(row['title'])}|{norm(row['artist'])}"

    groups: dict[str, list] = {}
    for row in rows:
        groups.setdefault(key_of(row), []).append(dict(row))
    dupes = [items for items in groups.values() if len(items) > 1]
    dupes.sort(key=lambda items: len(items), reverse=True)
    return {
        "groups": dupes[:limit],
        "group_count": len(dupes),
        "track_count": sum(len(items) for items in dupes),
        "scanned": len(rows),
    }
