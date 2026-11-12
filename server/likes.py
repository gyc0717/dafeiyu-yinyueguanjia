"""收藏（我的喜欢）—— 只存在本应用里，不写回任何平台。

同一首歌在 QQ / 网易云 / 本地是三条不同的 track，收藏按 `work_key`（歌名+歌手归一化）
归并：收一次，三个平台那条都算收过；取消也是一起取消。
"""
from __future__ import annotations

from .db import connect, now_local


def _work_of(conn, track_id: int) -> str:
    row = conn.execute("SELECT work_key FROM tracks WHERE id=?", (int(track_id),)).fetchone()
    return (row["work_key"] or "") if row else ""


def _siblings(conn, track_id: int) -> list[int]:
    key = _work_of(conn, track_id)
    if not key:
        return [int(track_id)]
    rows = conn.execute("SELECT id FROM tracks WHERE work_key=?", (key,)).fetchall()
    ids = [int(r["id"]) for r in rows]
    return ids or [int(track_id)]


def ids() -> list[int]:
    conn = connect()
    try:
        return [int(row["track_id"]) for row in conn.execute("SELECT track_id FROM likes ORDER BY rowid")]
    finally:
        conn.close()


def count() -> int:
    """按「首」算，不按「条」算。"""
    conn = connect()
    try:
        row = conn.execute(
            """SELECT COUNT(DISTINCT COALESCE(NULLIF(t.work_key, ''), 'id:' || t.id)) AS n
               FROM likes l JOIN tracks t ON t.id = l.track_id"""
        ).fetchone()
        return int(row["n"])
    finally:
        conn.close()


def add(track_id: int) -> bool:
    conn = connect()
    try:
        changed = 0
        stamp = now_local()
        for tid in _siblings(conn, track_id):
            cur = conn.execute(
                "INSERT OR IGNORE INTO likes(track_id, created_at) VALUES(?, ?)",
                (tid, stamp),
            )
            changed += cur.rowcount
        conn.commit()
        return changed > 0
    finally:
        conn.close()


def remove(track_id: int) -> bool:
    conn = connect()
    try:
        changed = 0
        for tid in _siblings(conn, track_id):
            cur = conn.execute("DELETE FROM likes WHERE track_id=?", (tid,))
            changed += cur.rowcount
        conn.commit()
        return changed > 0
    finally:
        conn.close()


def tracks(limit: int = 1000):
    """收藏列表：每首歌只出一行（优先本地文件，其次最早收录的那条）。"""
    conn = connect()
    try:
        return conn.execute(
            """SELECT * FROM (
                   SELECT t.*, l.created_at AS liked_at,
                          ROW_NUMBER() OVER (
                              PARTITION BY COALESCE(NULLIF(t.work_key, ''), 'id:' || t.id)
                              ORDER BY CASE WHEN t.provider = 'local' THEN 0 ELSE 1 END, t.id
                          ) AS rn
                   FROM likes l JOIN tracks t ON t.id = l.track_id
               ) WHERE rn = 1
               ORDER BY liked_at DESC, id DESC
               LIMIT ?""",
            (max(1, int(limit)),),
        ).fetchall()
    finally:
        conn.close()
