"""Tidy-up: build a read-only plan, then (only when asked) move the files.

`build_plan()` never writes. `create_run()` freezes a plan into `tidy_runs` /
`tidy_items`; `start_run()` moves the pending items one at a time and records
each result, so `undo_run()` can put them back.
"""
from __future__ import annotations

import os
import re
import time
from pathlib import Path

from . import config
from .db import connect, now_local

INVALID = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
RESERVED = {
    "CON", "PRN", "AUX", "NUL",
    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),
}


def safe_segment(raw: str, fallback: str = "未知") -> str:
    """One path component that Windows will accept."""
    text = INVALID.sub("_", (raw or "").strip())
    text = text.rstrip(" .")
    text = re.sub(r"\s+", " ", text)
    if not text:
        return fallback
    if text.upper() in RESERVED:
        text = f"_{text}"
    return text[:80]


def default_root() -> str:
    """Where the tidy run would archive files; never created by the planner."""
    override = os.environ.get("MUSIC_HUB_TIDY_ROOT")
    if override:
        return override
    if os.name == "nt":
        return r"D:\音乐库"
    return str(config.DATA.parent / "tidy-target")


def build_plan(root: str | None = None, layout: str = "hybrid", limit: int = 200) -> dict:
    """Return the dry-run plan. `limit` only trims the rows we send back."""
    base = Path(root or default_root()).expanduser()
    rows = _local_rows()
    plan: list[dict] = []
    seen: dict[str, int] = {}
    summary = {
        "total": len(rows),
        "planned": 0,
        "already_there": 0,
        "missing": 0,
        "conflict": 0,
        "duplicate_target": 0,
        "tagged": 0,
        "by_month": 0,
        "bytes": 0,
    }
    for row in rows:
        source = Path(row["path"] or "")
        artist = safe_segment(row["artist"], "未知歌手")
        album = safe_segment(row["album"], "未知专辑")
        name = safe_segment(source.name, f"{row['title'] or 'track'}{source.suffix}")
        if not Path(name).suffix:
            name = f"{name}{source.suffix or '.mp3'}"
        tagged = bool((row["artist"] or "").strip() and (row["album"] or "").strip())
        if layout == "hybrid":
            # tagged files keep the artist/album layout; untagged ones go by month
            target = base / artist / album / name if tagged else base / _month_of(source) / name
        elif layout == "artist":
            target = base / artist / name
        elif layout == "flat":
            target = base / name
        else:
            target = base / artist / album / name

        item = {
            "id": int(row["id"]),
            "title": row["title"],
            "artist": row["artist"] or "",
            "album": row["album"] or "",
            "source": str(source),
            "target": str(target),
            "size": int(row["size"] or 0) if row["size"] is not None else _size(source),
            "action": "move",
            "status": "ok",
            "note": "",
        }

        try:
            same = source.resolve() == target.resolve()
        except OSError:
            same = False
        exists_source = source.exists()

        if not exists_source:
            item["status"] = "missing"
            item["action"] = "skip"
            item["note"] = "源文件不在了"
            summary["missing"] += 1
        elif same:
            item["status"] = "already_there"
            item["action"] = "skip"
            item["note"] = "已经在这个位置"
            summary["already_there"] += 1
        elif str(target) in seen:
            item["status"] = "duplicate_target"
            item["action"] = "skip"
            item["note"] = f"和 #{seen[str(target)]} 的目标相同"
            summary["duplicate_target"] += 1
        elif target.exists():
            item["status"] = "conflict"
            item["action"] = "skip"
            item["note"] = "目标已有同名文件，跳过"
            summary["conflict"] += 1
        else:
            seen[str(target)] = item["id"]
            summary["planned"] += 1
            summary["bytes"] += item["size"]
            if tagged:
                summary["tagged"] += 1
            else:
                summary["by_month"] += 1

        plan.append(item)

    return {
        "root": str(base),
        "layout": layout,
        "dry_run": True,
        "summary": summary,
        "plan": plan[:limit],
        "truncated": max(0, len(plan) - limit),
        "actionable": [item for item in plan if item["action"] == "move"][:limit],
    }


def _local_rows():
    conn = connect()
    try:
        return conn.execute(
            "SELECT id, title, artist, album, path, size FROM tracks "
            "WHERE provider='local' ORDER BY artist, album, title"
        ).fetchall()
    finally:
        conn.close()


def _month_of(source: Path) -> str:
    """Untagged files are filed under the month they landed on disk."""
    try:
        stamp = source.stat().st_mtime
    except OSError:
        return "未知月份"
    return time.strftime("%Y-%m", time.localtime(stamp))


def _size(path: Path) -> int:
    try:
        return path.stat().st_size
    except OSError:
        return 0


# ------------------------------------------------------------------ execution
# A run is the frozen plan. Every item carries its own status so an interrupted
# run can be resumed, and so "undo" knows exactly what to put back where.
RUN_STATUS = ("pending", "running", "done", "failed", "undone", "partial")


def move_file(source: Path, target: Path) -> None:
    """Move one file, creating folders. Never overwrites an existing target."""
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        raise FileExistsError(f"目标已存在：{target}")
    try:
        os.replace(source, target)  # same volume: atomic
    except OSError:
        # different volume: copy, verify the size, then drop the source
        import shutil

        shutil.copy2(source, target)
        if target.stat().st_size != source.stat().st_size:
            try:
                target.unlink()
            except OSError:
                pass
            raise OSError(f"复制后大小不一致：{target}")
        source.unlink()


def allowed_roots() -> list[Path]:
    roots = []
    for root in config.library_roots():
        try:
            roots.append(Path(root).resolve())
        except OSError:
            continue
    return roots


def under_library(path: Path) -> bool:
    """Only files we scanned may be moved — a bad plan cannot touch anything else."""
    try:
        resolved = path.resolve()
    except OSError:
        return False
    return any(resolved.is_relative_to(root) for root in allowed_roots() if root != resolved)


def create_run(root: str | None = None, layout: str = "hybrid") -> dict:
    """Freeze the current plan into tidy_runs / tidy_items."""
    plan = build_plan(root=root, layout=layout, limit=5000)
    movable = sum(1 for item in plan["plan"] if item["action"] == "move")
    conn = connect()
    try:
        now = now_local()
        cur = conn.execute(
            """INSERT INTO tidy_runs(root, layout, status, created_at, total, moved, failed)
               VALUES(?,?,?,?,?,0,0)""",
            (plan["root"], plan["layout"], "pending", now, movable),
        )
        run_id = int(cur.lastrowid)
        rows = []
        for item in plan["plan"]:
            status = "pending" if item["action"] == "move" else "skipped"
            rows.append(
                (
                    run_id,
                    item["id"],
                    item["source"],
                    item["target"],
                    status,
                    "",
                    item["title"] or "",
                    item["artist"] or "",
                    int(item["size"] or 0),
                )
            )
        conn.executemany(
            """INSERT INTO tidy_items(run_id, track_id, source, target, status, error, title, artist, size)
               VALUES(?,?,?,?,?,?,?,?,?)""",
            rows,
        )
        conn.commit()
        return {"run_id": run_id, "root": plan["root"], "layout": plan["layout"], "summary": plan["summary"]}
    finally:
        conn.close()


def start_run(run_id: int, limit_delay: float = 0.05) -> dict:
    """Move every pending item. Returns the run's final counts."""
    conn = connect()
    try:
        run = conn.execute("SELECT * FROM tidy_runs WHERE id=?", (run_id,)).fetchone()
        if not run:
            return {"ok": False, "error": "找不到这个整理任务"}
        if run["status"] == "running":
            return {"ok": False, "error": "这个任务正在跑"}
        conn.execute("UPDATE tidy_runs SET status='running', started_at=? WHERE id=?", (now_local(), run_id))
        conn.commit()
        items = conn.execute(
            "SELECT * FROM tidy_items WHERE run_id=? AND status IN ('pending','failed') ORDER BY id",
            (run_id,),
        ).fetchall()
    finally:
        conn.close()

    moved = failed = 0
    for item in items:
        source = Path(item["source"])
        target = Path(item["target"])
        try:
            if not source.exists():
                raise FileNotFoundError("源文件已经不在了")
            if not under_library(source):
                raise PermissionError("不在曲库目录里，拒绝移动")
            move_file(source, target)
            moved += 1
            _finish_item(run_id, item["id"], "moved", "")
            if item["track_id"]:
                _retarget_track(int(item["track_id"]), str(target))
        except Exception as exc:  # noqa: BLE001 - every failure is recorded, none aborts the run
            failed += 1
            _finish_item(run_id, item["id"], "failed", str(exc)[:200])
        time.sleep(max(0.0, limit_delay))

    conn = connect()
    try:
        total = conn.execute("SELECT COUNT(*) AS n FROM tidy_items WHERE run_id=?", (run_id,)).fetchone()["n"]
        done = conn.execute(
            "SELECT COUNT(*) AS n FROM tidy_items WHERE run_id=? AND status='moved'", (run_id,)
        ).fetchone()["n"]
        status = "done" if failed == 0 else ("partial" if done else "failed")
        conn.execute(
            "UPDATE tidy_runs SET status=?, finished_at=?, total=?, moved=?, failed=? WHERE id=?",
            (status, now_local(), total, done, failed, run_id),
        )
        conn.commit()
    finally:
        conn.close()
    return {"ok": True, "run_id": run_id, "moved": moved, "failed": failed}


def undo_run(run_id: int) -> dict:
    """Put every moved file back. Refuses items whose target has changed."""
    conn = connect()
    try:
        items = conn.execute(
            "SELECT * FROM tidy_items WHERE run_id=? AND status='moved' ORDER BY id DESC",
            (run_id,),
        ).fetchall()
    finally:
        conn.close()
    if not items:
        return {"ok": True, "run_id": run_id, "restored": 0, "blocked": 0, "note": "这次任务没有搬过文件"}

    restored = blocked = 0
    for item in items:
        source = Path(item["source"])
        target = Path(item["target"])
        try:
            if not target.exists():
                raise FileNotFoundError("目标文件不见了，可能被手动移走")
            if source.exists():
                raise FileExistsError("原位置已经有同名文件，先处理它")
            move_file(target, source)
            restored += 1
            _finish_item(run_id, item["id"], "restored", "")
            if item["track_id"]:
                _retarget_track(int(item["track_id"]), str(source))
        except Exception as exc:  # noqa: BLE001
            blocked += 1
            _finish_item(run_id, item["id"], "undo_blocked", str(exc)[:200])
        time.sleep(0.02)

    conn = connect()
    try:
        status = "undone" if restored and not blocked else ("partial" if restored else "undo_failed")
        conn.execute("UPDATE tidy_runs SET status=?, undone_at=? WHERE id=?", (status, now_local(), run_id))
        conn.commit()
    finally:
        conn.close()
    return {"ok": True, "run_id": run_id, "restored": restored, "blocked": blocked}


def _free_space(path: Path) -> int:
    """目标盘剩余空间（字节）；拿不到就返回 -1。"""
    probe = path
    while not probe.exists() and probe.parent != probe:
        probe = probe.parent
    try:
        return int(shutil.disk_usage(str(probe)).free)
    except Exception:  # noqa: BLE001
        return -1


def probe_run(run_id: int, limit: int = 30) -> dict:
    """开跑前的体检：只读，不移动任何文件。

    检查每一条：源文件还在不在、目标是不是已经有同号文件、目标盘还有多少空间、
    是不是跨盘（跨盘移动会变成复制+删除，慢但可行）。
    """
    conn = connect()
    try:
        run = conn.execute("SELECT * FROM tidy_runs WHERE id=?", (run_id,)).fetchone()
        if not run:
            return {"ok": False, "error": "找不到这个整理任务"}
        items = conn.execute(
            "SELECT * FROM tidy_items WHERE run_id=? AND status='pending' ORDER BY id", (run_id,)
        ).fetchall()
    finally:
        conn.close()

    problems: list[dict] = []
    ready = 0
    total_size = 0
    volumes: set[str] = set()
    for item in items:
        source = Path(item["source"])
        target = Path(item["target"])
        total_size += int(item["size"] or 0)
        issue = ""
        level = "warn"
        if not source.exists():
            issue, level = "源文件已经不在了", "error"
        elif not under_library(source):
            issue, level = "不在曲库目录里", "error"
        elif target.exists():
            issue, level = "目标位置已有同名文件", "error"
        else:
            try:
                volumes.add(target.drive or "")
            except Exception:  # noqa: BLE001
                pass
            probe_dir = target.parent
            while not probe_dir.exists() and probe_dir.parent != probe_dir:
                probe_dir = probe_dir.parent
            if not probe_dir.exists():
                issue, level = "目标目录的上级不存在", "error"
            elif not os.access(str(probe_dir), os.W_OK):
                issue, level = "目标目录不可写", "error"
            elif source.drive and target.drive and source.drive.lower() != target.drive.lower():
                issue, level = "跨盘移动（会先复制再删除，比较慢）", "warn"
        if level == "error":
            problems.append({"level": level, "title": item["title"] or source.name, "source": str(source), "target": str(target), "message": issue})
        else:
            ready += 1
            if issue:
                problems.append({"level": level, "title": item["title"] or source.name, "source": str(source), "target": str(target), "message": issue})

    free = _free_space(Path(run["root"]))
    space_ok = free < 0 or free > total_size * 1.1
    if not space_ok:
        problems.insert(0, {"level": "error", "title": "空间不足", "source": "", "target": run["root"], "message": f"要搬 {total_size} 字节，目标盘只剩 {free} 字节"})

    errors = sum(1 for item in problems if item["level"] == "error")
    return {
        "ok": True,
        "run_id": run_id,
        "status": run["status"],
        "checked": len(items),
        "ready": ready,
        "errors": errors,
        "warnings": sum(1 for item in problems if item["level"] == "warn"),
        "cross_volume": bool(run["root"]) and any(
            (Path(i["source"]).drive or "").lower() != (Path(i["target"]).drive or "").lower() for i in items
        ),
        "total_size": total_size,
        "free_space": free,
        "problems": problems[:limit],
        "clean": errors == 0,
    }


def resume_run(run_id: int) -> dict:
    """断点续跑：上一轮被中断（进程退出、关机）后，把剩下没搬的接着搬。

    只处理 pending / failed 的条目；已经 moved 的不会再动。
    """
    conn = connect()
    try:
        run = conn.execute("SELECT * FROM tidy_runs WHERE id=?", (run_id,)).fetchone()
        if not run:
            return {"ok": False, "error": "找不到这个整理任务"}
        if run["status"] == "undone":
            return {"ok": False, "error": "这个任务已经回滚过了"}
        left = conn.execute(
            "SELECT COUNT(*) AS n FROM tidy_items WHERE run_id=? AND status IN ('pending','failed')",
            (run_id,),
        ).fetchone()["n"]
        if not left:
            return {"ok": False, "error": "没有需要继续的条目"}
        # 中断时状态可能停在 running，这里强制放开，让 start_run 接着跑
        conn.execute("UPDATE tidy_runs SET status='partial' WHERE id=?", (run_id,))
        conn.commit()
    finally:
        conn.close()
    return start_run(run_id)


def run_status(run_id: int) -> dict | None:
    conn = connect()
    try:
        run = conn.execute("SELECT * FROM tidy_runs WHERE id=?", (run_id,)).fetchone()
        if not run:
            return None
        counts = {
            row["status"]: int(row["n"])
            for row in conn.execute(
                "SELECT status, COUNT(*) AS n FROM tidy_items WHERE run_id=? GROUP BY status", (run_id,)
            )
        }
        recent = [
            dict(row)
            for row in conn.execute(
                """SELECT status, title, source, target, error FROM tidy_items
                   WHERE run_id=? AND status NOT IN ('pending','skipped')
                   ORDER BY id DESC LIMIT 20""",
                (run_id,),
            )
        ]
        pending = int(counts.get("pending", 0)) + int(counts.get("failed", 0))
        resumable = pending > 0 and run["status"] in ("running", "partial", "failed", "pending")
        return {
            "run": dict(run),
            "counts": counts,
            "recent": recent,
            "pending": pending,
            "resumable": resumable,
        }
    finally:
        conn.close()


def list_runs(limit: int = 20) -> list[dict]:
    conn = connect()
    try:
        return [
            dict(row)
            for row in conn.execute("SELECT * FROM tidy_runs ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
        ]
    finally:
        conn.close()


def _finish_item(run_id: int, item_id: int, status: str, error: str) -> None:
    conn = connect()
    try:
        conn.execute(
            "UPDATE tidy_items SET status=?, error=?, touched_at=? WHERE run_id=? AND id=?",
            (status, error, now_local(), run_id, item_id),
        )
        conn.commit()
    finally:
        conn.close()


def _retarget_track(track_id: int, path: str) -> None:
    """Keep the library row pointing at the file's new home."""
    conn = connect()
    try:
        conn.execute("UPDATE tracks SET path=?, updated_at=? WHERE id=?", (path, now_local(), track_id))
        conn.commit()
    finally:
        conn.close()
