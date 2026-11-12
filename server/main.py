"""FastAPI entry: library API, range streaming, play journal, static web app."""
from __future__ import annotations

import html
import hmac
import http.client
import json
import logging
import mimetypes
import os
import re
import socket
import sqlite3
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import (
    HTMLResponse,
    JSONResponse,
    FileResponse,
    JSONResponse,
    RedirectResponse,
    Response,
    StreamingResponse,
)
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import auth as _auth, config, journal, library, likes, online, playlists as playlist_store, providers, qqlogin, roadmap, tidy
from .db import connect, init_db, now_local
from .providers import AuthRequired, ProviderError

log = logging.getLogger("music-hub")
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

mimetypes.add_type("audio/mp4", ".m4a")
mimetypes.add_type("audio/ogg", ".opus")
# 系统注册表里 .aac 会落到 audio/vnd.dlna.adts、.ape 干脆没有类型，
# 浏览器据此会拒绝播放；这几个是手机端播放 flac/aac 的必要声明。
mimetypes.add_type("audio/flac", ".flac")
mimetypes.add_type("audio/aac", ".aac")
mimetypes.add_type("audio/ape", ".ape")

PROVIDER_LABELS = {"local": "本地曲库", "qq": "QQ 音乐"}
# 本地服务没有登录态，只允许应用自己的来源；挡浏览器里别的站点发起的写请求（CSRF）。
ALLOWED_ORIGINS = {
    "http://127.0.0.1:8787",
    "http://localhost:8787",
    "http://[::1]:8787",
}
ONLINE_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    if library.count_tracks() == 0:
        log.info("empty library, first scan ...")
        result = library.scan()
        log.info("scan done: %s added, %s total", result["added"], result["total"])
    _auto_backup()
    stale = journal.close_open_events()
    if stale:
        log.info("closed %s stale play event(s) from previous run", stale)
    yield


app = FastAPI(title="大肥鱼音乐管家", version="0.2.1", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(ALLOWED_ORIGINS),
    allow_methods=["*"],
    allow_headers=["*"],
)


def _same_origin(request: Request, origin: str) -> bool:
    """Origin 的 host:port 与请求自己的 Host 一致，就算同源。"""
    if origin in ALLOWED_ORIGINS:
        return True
    host = request.headers.get("host", "")
    _, _, rest = origin.partition("://")
    return bool(host) and rest.rstrip("/") == host


@app.middleware("http")
async def block_cross_site_writes(request: Request, call_next):
    """本地服务无鉴权：拒绝其他站点发来的非只读请求，避免被网页 CSRF。

    局域网模式下手机访问的是 http://<IP>:8787，来源天然不在 ALLOWED_ORIGINS 里，
    所以同源（Origin 的 host:port 等于请求自己的 Host）一律放行，只挡真正的外站。
    """
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        origin = request.headers.get("origin")
        site = request.headers.get("sec-fetch-site")
        if (origin and not _same_origin(request, origin)) or (not origin and site == "cross-site"):
            return JSONResponse({"detail": "跨站请求被拒绝"}, status_code=403)
    return await call_next(request)


# ------------------------------------------------------------------ helpers
def _track_json(row, extra: dict | None = None) -> dict:
    cover = row["cover"]
    if cover and cover.startswith(("http://", "https://")):
        cover_url = cover
    elif cover:
        cover_url = f"/api/tracks/{row['id']}/cover?v={int(row['mtime'] or 0)}"
    else:
        cover_url = None
    fmt = (row["format"] or "").upper()
    if not fmt:
        fmt = Path(row["path"]).suffix.lstrip(".").upper() or "AUDIO"
    data = {
        "id": row["id"],
        "title": row["title"],
        "artist": row["artist"] or "未知歌手",
        "album": row["album"] or "",
        "duration_ms": row["duration_ms"],
        "provider": row["provider"],
        "provider_label": PROVIDER_LABELS.get(row["provider"], row["provider"]),
        "has_cover": bool(cover),
        "cover_url": cover_url,
        "has_lyrics": bool(row["lyrics"]),
        "format": fmt,
        "work_key": (row["work_key"] if "work_key" in row.keys() else None),
    }
    if extra:
        data.update(extra)
    return data


def _track_row(track_id: int):
    conn = connect()
    try:
        return conn.execute("SELECT * FROM tracks WHERE id=?", (track_id,)).fetchone()
    finally:
        conn.close()


# ----------------------------------------------------------------- backups
BACKUP_DIR = config.DATA / "backups"


def _backup_dir() -> Path:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    return BACKUP_DIR


def _backup_info(path: Path) -> dict:
    stat = path.stat()
    return {
        "name": path.name,
        "size": stat.st_size,
        "mtime": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(stat.st_mtime)),
    }


def _create_backup(name: str) -> dict:
    """Snapshot the live DB with SQLite's backup API (safe under WAL)."""
    target = _backup_dir() / name
    src = sqlite3.connect(config.DB_PATH, timeout=10)
    dst = sqlite3.connect(target, timeout=10)
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()
    return _backup_info(target)


def _auto_backup() -> None:
    try:
        name = f"auto-{time.strftime('%Y%m%d')}.db"
        if not (BACKUP_DIR / name).exists():
            info = _create_backup(name)
            log.info("auto backup: %s (%s bytes)", info["name"], info["size"])
        # keep auto backups for 14 days
        cutoff = time.time() - 14 * 24 * 3600
        for path in BACKUP_DIR.glob("auto-*.db"):
            if path.stat().st_mtime < cutoff:
                path.unlink(missing_ok=True)
    except Exception:
        log.exception("auto backup failed")


class BackupName(BaseModel):
    name: str


def _safe_backup_path(name: str) -> Path:
    if not name or Path(name).name != name or not name.endswith(".db"):
        raise HTTPException(400, "备份文件名不合法")
    path = BACKUP_DIR / name
    if not path.is_file():
        raise HTTPException(404, "找不到这个备份")
    return path


@app.get("/api/backups")
def list_backups():
    _backup_dir()
    items = [_backup_info(path) for path in BACKUP_DIR.glob("*.db") if path.is_file()]
    items.sort(key=lambda item: item["mtime"], reverse=True)
    return {"dir": str(BACKUP_DIR), "items": items}


@app.post("/api/backups")
def create_backup():
    name = f"manual-{time.strftime('%Y%m%d-%H%M%S')}.db"
    info = _create_backup(name)
    log.info("manual backup: %s (%s bytes)", info["name"], info["size"])
    return {"ok": True, "backup": info, "dir": str(BACKUP_DIR)}


@app.post("/api/backups/restore")
def restore_backup(body: BackupName):
    source_path = _safe_backup_path(body.name)
    check = sqlite3.connect(source_path, timeout=10)
    try:
        integrity = check.execute("PRAGMA integrity_check").fetchone()[0]
        has_tracks = check.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='tracks'"
        ).fetchone()
    finally:
        check.close()
    if integrity != "ok" or not has_tracks:
        raise HTTPException(400, "这个文件不是有效的音乐管家备份")

    safety = _create_backup(f"pre-restore-{time.strftime('%Y%m%d-%H%M%S')}.db")
    src = sqlite3.connect(source_path, timeout=10)
    dst = sqlite3.connect(config.DB_PATH, timeout=10)
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()
    log.warning("restored backup %s (safety: %s)", body.name, safety["name"])
    return {"ok": True, "restored": body.name, "safety": safety["name"]}


@app.post("/api/backups/open")
def open_backups():
    folder = _backup_dir()
    if os.name == "nt":
        os.startfile(str(folder))  # type: ignore[attr-defined]
    return {"ok": True, "dir": str(folder)}


@app.delete("/api/backups/{name}")
def delete_backup(name: str):
    path = _safe_backup_path(name)
    path.unlink()
    return {"ok": True, "name": name}


# --------------------------------------------------------------------- api
@app.get("/api/health")
def health():
    return {"ok": True, "version": app.version, "tracks": library.count_tracks(), "time": now_local()}


@app.get("/api/config")
def get_config():
    return {
        "roots": [str(p) for p in config.library_roots()],
        "data_dir": str(config.DATA),
        "version": app.version,
    }


@app.get("/api/roadmap")
def get_roadmap():
    return roadmap.load_roadmap()


@app.get("/api/tracks")
def list_tracks(
    q: str = Query("", max_length=100),
    provider: str = Query("local", max_length=32),
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0),
):
    conn = connect()
    try:
        clauses: list[str] = []
        params: list = []
        if provider and provider != "all":
            clauses.append("provider=?")
            params.append(provider)
        if q.strip():
            like = f"%{q.strip()}%"
            clauses.append("(title LIKE ? OR artist LIKE ? OR album LIKE ?)")
            params.extend([like, like, like])
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        total = conn.execute(f"SELECT COUNT(*) FROM tracks {where}", params).fetchone()[0]
        rows = conn.execute(
            f"SELECT * FROM tracks {where} ORDER BY added_at DESC, id DESC LIMIT ? OFFSET ?",
            [*params, limit, offset],
        ).fetchall()
        return {"total": total, "items": [_track_json(r) for r in rows]}
    finally:
        conn.close()


class NeteaseQrCheck(BaseModel):
    key: str


@app.post("/api/online/netease/qr")
def netease_qr():
    """要一张新的网易云扫码票，返回 unikey + 二维码图片地址。"""
    source = providers.get_provider("netease")
    try:
        key = source.qr_key()
    except ProviderError as exc:
        raise HTTPException(502, str(exc)) from exc
    return {"key": key, "png": f"/api/online/netease/qr.png?key={key}", "url": f"https://music.163.com/login?codekey={key}"}


@app.get("/api/online/netease/qr.png")
def netease_qr_png(key: str = Query(..., max_length=64)):
    import io

    import qrcode

    image = qrcode.make(f"https://music.163.com/login?codekey={key}")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return Response(content=buffer.getvalue(), media_type="image/png", headers={"Cache-Control": "no-store"})


@app.get("/api/online/netease/qr/check")
def netease_qr_check(key: str = Query(..., max_length=64)):
    source = providers.get_provider("netease")
    try:
        return source.qr_check(key)
    except ProviderError as exc:
        raise HTTPException(502, str(exc)) from exc


@app.post("/api/online/netease/logout")
def netease_logout():
    providers.get_provider("netease").logout()
    return {"ok": True}

@app.get("/api/online/status")
def online_status():
    return {"providers": providers.status(), "login": qqlogin.status()}


@app.get("/api/online/login")
def online_login_status():
    """Progress of the login helper (polled by the onboarding screen)."""
    return qqlogin.status()


@app.post("/api/online/login")
def online_login(force: bool = False):
    """Open the QQ Music login window through qqmusic-mcp."""
    return qqlogin.start(force=force)


@app.post("/api/online/logout")
def online_logout():
    result = qqlogin.logout()
    if isinstance(result, dict) and result.get("ok"):
        conn = connect()
        try:
            conn.execute("DELETE FROM qq_playlist_snapshots")
            conn.commit()
        finally:
            conn.close()
    return result


@app.get("/api/online/search")
def online_search(
    q: str = Query(..., min_length=1, max_length=100),
    provider: str = Query("qq", max_length=32),
    limit: int = Query(20, ge=1, le=40),
):
    try:
        source = providers.get_provider(provider)
        found = source.search(q, limit)
    except AuthRequired as exc:
        providers.mark_auth_error(provider, str(exc))
        raise HTTPException(401, str(exc)) from exc
    except ProviderError as exc:
        raise HTTPException(502, str(exc)) from exc

    ids = [online.upsert_track(item) for item in found]
    if not ids:
        return {"provider": provider, "label": source.label, "items": []}
    conn = connect()
    try:
        placeholders = ",".join("?" for _ in ids)
        rows = {
            row["id"]: row
            for row in conn.execute(f"SELECT * FROM tracks WHERE id IN ({placeholders})", ids)
        }
    finally:
        conn.close()
    return {
        "provider": provider,
        "label": source.label,
        "items": [_track_json(rows[i]) for i in ids if i in rows],
    }


@app.get("/api/tracks/{track_id}")
def get_track(track_id: int):
    row = _track_row(track_id)
    if not row:
        raise HTTPException(404, "track not found")
    return _track_json(row)


# ----------------------------------------------------------------- playlists
@app.get("/api/netease/playlists")
def netease_playlists():
    """网易云登录后的「我的歌单」。"""
    try:
        return {"items": providers.get_provider("netease").playlists()}
    except AuthRequired as exc:
        raise HTTPException(401, str(exc)) from exc
    except ProviderError as exc:
        raise HTTPException(502, str(exc)) from exc


@app.get("/api/netease/playlists/{playlist_id}")
def netease_playlist_tracks(
    playlist_id: str,
    limit: int = Query(300, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """分页读网易云歌单：大歌单（2000+ 首）一次只取一页。"""
    try:
        found, total = providers.get_provider("netease").playlist_songs(playlist_id, limit, offset)
    except AuthRequired as exc:
        raise HTTPException(401, str(exc)) from exc
    except ProviderError as exc:
        raise HTTPException(502, str(exc)) from exc
    ids = [online.upsert_track(item) for item in found]
    rows = []
    conn = connect()
    try:
        for track_id in ids:
            row = conn.execute("SELECT * FROM tracks WHERE id=?", (track_id,)).fetchone()
            if row:
                rows.append(_track_json(row))
    finally:
        conn.close()
    return {
        "items": rows,
        "total": total,
        "offset": offset,
        "loaded": len(rows),
        "has_more": offset + len(rows) < total,
    }


@app.get("/api/qq/playlists")
def qq_playlists():
    try:
        return {"items": providers.get_provider("qq").playlists()}
    except AuthRequired as exc:
        providers.mark_auth_error("qq", str(exc))
        raise HTTPException(401, str(exc)) from exc
    except ProviderError as exc:
        raise HTTPException(502, str(exc)) from exc


@app.get("/api/qq/playlists/{directory_id}")
def qq_playlist_detail(directory_id: int, limit: int = Query(300, ge=1, le=1000)):
    try:
        source = providers.get_provider("qq")
        meta = next((item for item in source.playlists() if item["directory_id"] == directory_id), None)
        if meta is None:
            raise HTTPException(404, "找不到这个歌单")
        if not meta.get("playlist_id"):
            raise HTTPException(400, "这个歌单没有可读的歌曲 id（可能是本地或 QZone 列表）")
        songs = source.playlist_songs(meta["playlist_id"])
    except HTTPException:
        raise
    except AuthRequired as exc:
        providers.mark_auth_error("qq", str(exc))
        raise HTTPException(401, str(exc)) from exc
    except ProviderError as exc:
        raise HTTPException(502, str(exc)) from exc
    return {
        "playlist": meta,
        "total": len(songs),
        "items": [
            {
                "title": song.title,
                "artist": song.artist,
                "album": song.album,
                "duration_ms": song.duration_ms,
                "cover": song.cover_url,
            }
            for song in songs[:limit]
        ],
    }


def _read_qq_snapshot(directory_id: int):
    """Return (payload, updated_ts) for a cached QQ playlist, or None."""
    conn = connect()
    try:
        row = conn.execute(
            "SELECT payload, updated_ts FROM qq_playlist_snapshots WHERE directory_id=?",
            (directory_id,),
        ).fetchone()
    finally:
        conn.close()
    if not row:
        return None
    return json.loads(row["payload"]), int(row["updated_ts"])


def _write_qq_snapshot(directory_id: int, result: dict) -> int:
    """Store the 24h snapshot; returns the epoch seconds it was stamped with."""
    synced_at = int(time.time())
    conn = connect()
    try:
        conn.execute(
            "INSERT OR REPLACE INTO qq_playlist_snapshots(directory_id, payload, updated_ts) VALUES(?,?,?)",
            (directory_id, json.dumps(result, ensure_ascii=False), synced_at),
        )
        conn.commit()
    finally:
        conn.close()
    return synced_at


def _fetch_qq_playlist(directory_id: int, limit: int) -> dict:
    """Ask QQ for a playlist and upsert its tracks; no snapshot bookkeeping."""
    try:
        source = providers.get_provider("qq")
        meta = next((item for item in source.playlists() if item["directory_id"] == directory_id), None)
        if meta is None:
            raise HTTPException(404, "找不到这个歌单")
        if not meta.get("playlist_id"):
            raise HTTPException(400, "这个歌单没有可读的歌曲 id（可能是本地或 QZone 列表）")
        songs = source.playlist_songs(meta["playlist_id"])
    except HTTPException:
        raise
    except AuthRequired as exc:
        providers.mark_auth_error("qq", str(exc))
        raise HTTPException(401, str(exc)) from exc
    except ProviderError as exc:
        raise HTTPException(502, str(exc)) from exc

    total = len(songs)
    subset = songs[:limit]
    ids = online.upsert_tracks(subset)
    if not ids:
        return {"playlist": meta, "total": total, "items": []}

    conn = connect()
    try:
        marks = ",".join("?" for _ in ids)
        rows = conn.execute(f"SELECT * FROM tracks WHERE id IN ({marks})", ids).fetchall()
        by_id = {int(row["id"]): row for row in rows}
        items = [_track_json(by_id[track_id]) for track_id in ids if track_id in by_id]
    finally:
        conn.close()
    return {"playlist": meta, "total": total, "items": items}


@app.get("/api/qq/playlists/{directory_id}/tracks")
def qq_playlist_tracks(
    directory_id: int,
    limit: int = Query(3000, ge=1, le=5000),
    refresh: bool = Query(False),
):
    """Open a QQ playlist: persist its metadata and return playable track rows.

    The user does not need to "import" anything; opening the list is enough.
    Audio still streams from QQ, so this is an index, not a download.

    A 24h snapshot is stored after the first open: reopening the same playlist
    (even after a page refresh) does not hit QQ again or re-upsert 2000+ rows.
    `refresh=true` bypasses it; the response also carries `cached` / `synced_at`.
    """
    if not refresh:
        snapshot = _read_qq_snapshot(directory_id)
        if snapshot:
            cached, synced_at = snapshot
            if int(time.time()) - synced_at < 24 * 3600:
                if limit < len(cached.get("items", [])):
                    cached["items"] = cached["items"][:limit]
                cached["cached"] = True
                cached["synced_at"] = synced_at
                return cached

    result = _fetch_qq_playlist(directory_id, limit)
    synced_at = _write_qq_snapshot(directory_id, result)
    result["cached"] = False
    result["synced_at"] = synced_at
    return result


@app.post("/api/qq/playlists/{directory_id}/sync")
def qq_playlist_sync(directory_id: int, limit: int = Query(3000, ge=1, le=5000)):
    """Force re-read one playlist from QQ and report what changed.

    The 24h snapshot is rewritten, so the next open is fresh without waiting
    for the TTL to expire. `added` / `removed` are counts of track rows whose
    ids appeared or disappeared; the same song re-appearing counts as nothing.
    """
    previous = _read_qq_snapshot(directory_id)
    previous_ids: set[int] = set()
    previous_total = 0
    previous_synced_at = None
    if previous:
        payload, previous_synced_at = previous
        previous_total = int(payload.get("total") or len(payload.get("items") or []))
        previous_ids = {int(item["id"]) for item in payload.get("items") or [] if item.get("id")}

    result = _fetch_qq_playlist(directory_id, limit)
    synced_at = _write_qq_snapshot(directory_id, result)
    new_ids = {int(item["id"]) for item in result.get("items") or [] if item.get("id")}
    result["cached"] = False
    result["synced_at"] = synced_at
    result["previous_total"] = previous_total
    result["previous_synced_at"] = previous_synced_at
    result["added"] = len(new_ids - previous_ids) if previous_ids else len(new_ids)
    result["removed"] = len(previous_ids - new_ids)
    log.info(
        "sync qq playlist %s: total=%s added=%s removed=%s",
        directory_id,
        result["total"],
        result["added"],
        result["removed"],
    )
    return result


class QQPlaylistImport(BaseModel):
    directory_id: int


@app.post("/api/playlists/import/qq")
def import_qq_playlist(body: QQPlaylistImport):
    try:
        source = providers.get_provider("qq")
        meta = next(
            (item for item in source.playlists() if item["directory_id"] == body.directory_id),
            None,
        )
        if meta is None:
            raise HTTPException(404, "找不到这个歌单")
        if not meta.get("playlist_id"):
            raise HTTPException(400, "这个歌单没有可读的歌曲 id（可能是本地或 QZone 列表）")
        songs = source.playlist_songs(meta["playlist_id"])
    except HTTPException:
        raise
    except AuthRequired as exc:
        providers.mark_auth_error("qq", str(exc))
        raise HTTPException(401, str(exc)) from exc
    except ProviderError as exc:
        raise HTTPException(502, str(exc)) from exc
    result = playlist_store.import_qq(meta["directory_id"], meta["name"], songs)
    result["song_count"] = len(songs)
    log.info("import qq playlist %s: %s", body.directory_id, result["imported"])
    return result


class LocalPlaylistCreate(BaseModel):
    name: str
    track_ids: list[int] | None = None


class LocalPlaylistRename(BaseModel):
    name: str


class PlaylistTrackIds(BaseModel):
    track_ids: list[int]


class QqPlaylistSave(BaseModel):
    directory_id: int
    name: str | None = None


@app.post("/api/playlists")
def create_local_playlist(body: LocalPlaylistCreate):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "歌单名不能为空")
    return playlist_store.create(name[:80], body.track_ids)


@app.patch("/api/playlists/{playlist_id}")
def rename_local_playlist(playlist_id: int, body: LocalPlaylistRename):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "歌单名不能为空")
    if not playlist_store.rename(playlist_id, name[:80]):
        raise HTTPException(404, "playlist not found")
    return {"ok": True, "name": name[:80]}


@app.delete("/api/playlists/{playlist_id}/tracks")
def remove_playlist_tracks(playlist_id: int, body: PlaylistTrackIds):
    if not playlist_store.get(playlist_id):
        raise HTTPException(404, "playlist not found")
    removed = playlist_store.remove_tracks(playlist_id, body.track_ids)
    return {"ok": True, "removed": removed}


@app.post("/api/playlists/{playlist_id}/reorder")
def reorder_playlist(playlist_id: int, body: PlaylistTrackIds):
    if not playlist_store.get(playlist_id):
        raise HTTPException(404, "playlist not found")
    if not playlist_store.reorder(playlist_id, body.track_ids):
        raise HTTPException(400, "曲目列表和现有歌单对不上，刷新后再试")
    return {"ok": True}


@app.post("/api/playlists/from-qq")
def save_qq_playlist(body: QqPlaylistSave):
    """Copy a QQ playlist into an editable local one (re-saving updates it)."""
    data = _fetch_qq_playlist(body.directory_id, 5000)
    name = (body.name or data.get("playlist", {}).get("name") or "").strip()
    result = playlist_store.save_copy(str(body.directory_id), name or "我的歌单", [item["id"] for item in data["items"]])
    result["total"] = data["total"]
    log.info("save qq playlist %s as local #%s: %s tracks", body.directory_id, result["playlist_id"], result["saved"])
    return result


@app.get("/api/playlists")
def local_playlists():
    return {"items": playlist_store.list_all()}


@app.get("/api/playlists/{playlist_id}")
def local_playlist(playlist_id: int):
    data = playlist_store.get(playlist_id)
    if not data:
        raise HTTPException(404, "playlist not found")
    return {
        "playlist": data["playlist"],
        "items": [_track_json(row) for row in data["tracks"]],
        "total": len(data["tracks"]),
    }


@app.delete("/api/playlists/{playlist_id}")
def delete_local_playlist(playlist_id: int):
    if not playlist_store.delete(playlist_id):
        raise HTTPException(404, "playlist not found")
    return {"ok": True}


class TrackDeleteBody(BaseModel):
    # trash = 文件移到回收站 + 从曲库移除；library = 只从曲库移除
    mode: str = "trash"


RECYCLE_SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "recycle.ps1"


def _in_library(path: Path) -> bool:
    """只允许删曲库目录里的文件，别的手滑也别想删。"""
    try:
        resolved = path.resolve()
    except OSError:
        return False
    for root in config.library_roots():
        try:
            resolved.relative_to(Path(root).resolve())
            return True
        except (ValueError, OSError):
            continue
    return False


@app.post("/api/tracks/{track_id}/delete")
def delete_track(track_id: int, body: TrackDeleteBody):
    """删一首歌：默认把文件丢进回收站（可还原），再从曲库里摘掉。"""
    row = _track_row(track_id)
    if not row:
        raise HTTPException(404, "track not found")
    mode = body.mode if body.mode in ("trash", "library") else "trash"
    removed_file = None
    if mode == "trash":
        if (row["provider"] or "local") != "local":
            raise HTTPException(400, "在线曲目没有本地文件，只能从曲库移除")
        raw = (row["path"] or "").strip()
        if not raw:
            raise HTTPException(400, "这条没有文件路径")
        path = Path(raw)
        if path.exists():
            if not _in_library(path):
                raise HTTPException(400, "不在曲库目录里，拒绝删除")
            proc = subprocess.run(
                [
                    "powershell",
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                    str(RECYCLE_SCRIPT),
                    "-Path",
                    str(path),
                ],
                capture_output=True,
                text=True,
                timeout=30,
            )
            if proc.returncode != 0 or path.exists():
                detail = (proc.stderr or proc.stdout or "").strip().splitlines()
                reason = detail[-1][:180] if detail else "文件还在原处"
                raise HTTPException(500, f"移到回收站失败：{reason}")
            removed_file = str(path)
    conn = connect()
    try:
        conn.execute("DELETE FROM tracks WHERE id=?", (track_id,))
        conn.commit()
    finally:
        conn.close()
    log.info("track %s deleted (mode=%s, file=%s)", track_id, mode, removed_file)
    return {"ok": True, "id": track_id, "mode": mode, "removed_file": removed_file}


class DurationUpdate(BaseModel):
    duration_ms: int


@app.post("/api/tracks/{track_id}/duration")
def set_duration(track_id: int, body: DurationUpdate):
    """The browser knows the real duration once metadata loads; backfill it."""
    if not 1000 <= body.duration_ms <= 86_400_000:
        raise HTTPException(400, "bad duration")
    conn = connect()
    try:
        cur = conn.execute(
            "UPDATE tracks SET duration_ms=? WHERE id=? AND (duration_ms IS NULL OR duration_ms < 1000)",
            (body.duration_ms, track_id),
        )
        conn.commit()
        return {"ok": cur.rowcount > 0, "duration_ms": body.duration_ms}
    finally:
        conn.close()


@app.get("/api/tracks/{track_id}/lyrics")
def get_lyrics(track_id: int):
    row = _track_row(track_id)
    if not row:
        raise HTTPException(404, "track not found")

    fetch_error = None
    if row["provider"] != "local" and not row["lyrics"]:
        try:
            text = providers.get_provider(row["provider"]).lyrics(row["provider_id"])
        except (AuthRequired, ProviderError) as exc:
            text = None
            fetch_error = str(exc)
            if isinstance(exc, AuthRequired):
                providers.mark_auth_error(row["provider"], str(exc))
        if text:
            conn = connect()
            try:
                conn.execute("UPDATE tracks SET lyrics=? WHERE id=?", (text, track_id))
                conn.commit()
            finally:
                conn.close()
            row = _track_row(track_id)

    parsed = library.parse_lrc(row["lyrics"])
    source = "sidecar" if row["lyrics_path"] else ("embedded" if row["lyrics"] else None)
    if row["provider"] != "local" and row["lyrics"]:
        source = "online"
    payload = {
        "track_id": track_id,
        "synced": parsed["synced"],
        "word_sync": bool(parsed.get("word_sync")),
        "offset_ms": parsed.get("offset_ms", 0),
        "lines": parsed["lines"],
        "meta": parsed.get("meta", {}),
        "source": source,
    }
    if fetch_error:
        payload["error"] = fetch_error
    return payload


@app.get("/api/tracks/{track_id}/cover")
def get_cover(track_id: int):
    row = _track_row(track_id)
    if not row or not row["cover"]:
        raise HTTPException(404, "no cover")
    if row["cover"].startswith(("http://", "https://")):
        return RedirectResponse(row["cover"], status_code=302)
    path = (config.COVERS / row["cover"]).resolve()
    covers_root = config.COVERS.resolve()
    if covers_root not in path.parents or not path.is_file():
        raise HTTPException(404, "no cover")
    return FileResponse(path, headers={"Cache-Control": "public, max-age=86400"})


def _parse_range(header: str | None, size: int):
    if not header:
        return None
    header = header.strip()
    # 多段 Range（bytes=0-1,5-6）不去拼 multipart，按 RFC 允许的做法整个忽略，
    # 回 200 全量；以前这里会判 invalid 回 416，客户端会把整个响应当成失败。
    if "," in header:
        return None
    m = re.match(r"bytes=(\d*)-(\d*)$", header)
    if not m:
        return "invalid"
    start_s, end_s = m.group(1), m.group(2)
    if not start_s and not end_s:
        return "invalid"
    if not start_s:
        length = int(end_s)
        if length <= 0:
            return "invalid"
        start = max(0, size - length)
        end = size - 1
    else:
        start = int(start_s)
        end = int(end_s) if end_s else size - 1
    if start >= size or start > end:
        return "invalid"
    return start, min(end, size - 1)


def _file_iter(path: Path, start: int, length: int, chunk: int = 128 * 1024):
    with path.open("rb") as fh:
        fh.seek(start)
        left = length
        while left > 0:
            block = fh.read(min(chunk, left))
            if not block:
                break
            left -= len(block)
            yield block


class _Upstream:
    """Tiny adapter so http.client responses look like urlopen responses."""

    def __init__(self, connection: http.client.HTTPConnection, response):
        self.connection = connection
        self.response = response
        self.status = response.status
        self.headers = response.headers

    def read(self, size: int = -1):
        return self.response.read(size)

    def close(self) -> None:
        try:
            self.response.close()
        finally:
            self.connection.close()


def _open_upstream(url: str, request: Request, redirects: int = 2):
    """Open the media URL forcing IPv4.

    The QQ CDN publishes AAAA records first; Windows then spends ~16s trying
    IPv6 before falling back, which looks like a hung stream. Plain HTTP is
    enough for QQ media, so connect to the A record directly with a Host header.
    """
    parsed = urllib.parse.urlparse(url)
    headers = {
        "Host": parsed.hostname or "",
        "User-Agent": ONLINE_UA,
        "Referer": "https://y.qq.com/",
        "Accept": "*/*",
    }
    rng = request.headers.get("range")
    if rng:
        headers["Range"] = rng

    if parsed.scheme != "http" or not parsed.hostname:
        upstream = urllib.request.Request(url, headers=headers, method=request.method)
        return urllib.request.urlopen(upstream, timeout=20)

    try:
        address = socket.gethostbyname(parsed.hostname)
    except OSError:
        upstream = urllib.request.Request(url, headers=headers, method=request.method)
        return urllib.request.urlopen(upstream, timeout=20)

    port = parsed.port or 80
    path = parsed.path or "/"
    if parsed.query:
        path = f"{path}?{parsed.query}"
    connection = http.client.HTTPConnection(address, port, timeout=15)
    try:
        connection.request(request.method, path, headers=headers)
        response = connection.getresponse()
    except Exception:
        connection.close()
        raise
    if response.status in (301, 302, 303, 307, 308) and redirects > 0:
        location = response.getheader("Location")
        response.close()
        connection.close()
        if location:
            return _open_upstream(urllib.parse.urljoin(url, location), request, redirects - 1)
    return _Upstream(connection, response)


def _upstream_iter(response, chunk: int = 128 * 1024):
    try:
        while True:
            block = response.read(chunk)
            if not block:
                break
            yield block
    finally:
        response.close()


def _online_stream(row, request: Request):
    source = providers.get_provider(row["provider"])
    try:
        log.debug("online stream #%s resolve %s", row["id"], row["provider_id"])
        url = source.resolve(row["provider_id"])
        log.debug("online stream #%s open", row["id"])
        try:
            upstream = _open_upstream(url, request)
        except urllib.error.HTTPError as exc:
            # vkey expired between resolve and fetch: refresh once.
            if exc.code not in (401, 403, 404, 410):
                raise
            source.invalidate(row["provider_id"])
            url = source.resolve(row["provider_id"], force=True)
            upstream = _open_upstream(url, request)
        if getattr(upstream, "status", 200) in (401, 403, 404, 410):
            upstream.close()
            source.invalidate(row["provider_id"])
            url = source.resolve(row["provider_id"], force=True)
            upstream = _open_upstream(url, request)
        log.debug("online stream #%s upstream %s", row["id"], upstream.status)
    except AuthRequired as exc:
        providers.mark_auth_error(row["provider"], str(exc))
        raise HTTPException(401, str(exc)) from exc
    except ProviderError as exc:
        raise HTTPException(502, str(exc)) from exc
    except urllib.error.HTTPError as exc:
        raise HTTPException(502, f"音频源返回 HTTP {exc.code}") from exc
    except urllib.error.URLError as exc:
        raise HTTPException(502, f"连不上音频源：{exc.reason}") from exc

    headers = {}
    for name in ("Content-Type", "Content-Length", "Content-Range", "Accept-Ranges"):
        value = upstream.headers.get(name)
        if value:
            headers[name] = value
    headers.setdefault("Accept-Ranges", "bytes")
    headers["Cache-Control"] = "no-cache"
    if request.method == "HEAD":
        status = upstream.status
        upstream.close()
        return Response(status_code=status, headers=headers)
    return StreamingResponse(_upstream_iter(upstream), status_code=upstream.status, headers=headers)


@app.api_route("/api/stream/{track_id}", methods=["GET", "HEAD"])
def stream(track_id: int, request: Request):
    row = _track_row(track_id)
    if not row:
        raise HTTPException(404, "track not found")
    if row["provider"] != "local":
        return _online_stream(row, request)
    path = Path(row["path"])
    if not path.is_file():
        raise HTTPException(404, "file missing on disk")
    size = path.stat().st_size
    ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    rng = _parse_range(request.headers.get("range"), size)
    headers = {
        "Accept-Ranges": "bytes",
        "Content-Type": ctype,
        "Cache-Control": "no-cache",
    }
    if rng == "invalid":
        return Response(
            status_code=416,
            headers={"Content-Range": f"bytes */{size}", "Accept-Ranges": "bytes"},
        )
    if rng:
        start, end = rng
        length = end - start + 1
        headers.update(
            {
                "Content-Range": f"bytes {start}-{end}/{size}",
                "Content-Length": str(length),
            }
        )
        if request.method == "HEAD":
            return Response(status_code=206, headers=headers)
        return StreamingResponse(_file_iter(path, start, length), status_code=206, headers=headers)

    headers["Content-Length"] = str(size)
    if request.method == "HEAD":
        return Response(status_code=200, headers=headers)
    return StreamingResponse(_file_iter(path, 0, size), status_code=200, headers=headers)


# ------------------------------------------------------------------ journal
class PlayStart(BaseModel):
    track_id: int
    source: str = "web"
    position_ms: int = 0


class PlayProgress(BaseModel):
    event_id: int
    played_ms: int
    position_ms: int | None = None


class PlayEnd(BaseModel):
    event_id: int
    played_ms: int = 0
    completed: bool | None = None


@app.post("/api/play/start")
def play_start(body: PlayStart):
    if not _track_row(body.track_id):
        raise HTTPException(404, "track not found")
    event_id = journal.start_event(body.track_id, body.source, body.position_ms)
    return {"event_id": event_id}


@app.post("/api/play/progress")
def play_progress(body: PlayProgress):
    ok = journal.progress_event(body.event_id, body.played_ms)
    return {"ok": ok}


@app.post("/api/play/end")
def play_end(body: PlayEnd):
    ok = journal.end_event(body.event_id, body.played_ms, body.completed)
    return {"ok": ok}


@app.get("/api/recent")
def recent_tracks(limit: int = Query(30, ge=1, le=100)):
    rows = journal.recent(limit)
    return {
        "items": [
            _track_json(r, {"last_played_at": r["last_played_at"], "plays": r["plays"]})
            for r in rows
        ]
    }


@app.get("/api/stats/today")
def stats_today():
    stats = journal.stats_today()
    stats["minutes"] = round(stats["played_ms"] / 60000, 1)
    return stats


@app.get("/api/stats/week")
def stats_week(days: int = Query(7, ge=1, le=31)):
    data = journal.stats_week(days)
    for item in data["series"]:
        item["minutes"] = round(item["played_ms"] / 60000, 1)
    data["totals"]["minutes"] = round(data["totals"]["played_ms"] / 60000, 1)
    return data


@app.get("/api/library/duplicates")
def library_duplicates(limit: int = Query(60, ge=1, le=300)):
    return journal.library_duplicates(limit)


@app.get("/api/tidy/plan")
def tidy_plan(
    root: str | None = Query(None, max_length=260),
    layout: str = Query("hybrid", pattern="^(hybrid|artist-album|artist|flat)$"),
    limit: int = Query(200, ge=1, le=2000),
):
    """Dry run only: where each local file *would* move. Touches no files."""
    return tidy.build_plan(root=root, layout=layout, limit=limit)


class TidyRunCreate(BaseModel):
    root: str | None = None
    layout: str = "hybrid"


@app.post("/api/tidy/runs")
def tidy_run_create(body: TidyRunCreate):
    if body.layout not in ("hybrid", "artist-album", "artist", "flat"):
        raise HTTPException(400, "不认识的排版规则")
    return tidy.create_run(root=body.root, layout=body.layout)


@app.get("/api/tidy/runs")
def tidy_runs(limit: int = Query(20, ge=1, le=100)):
    return {"items": tidy.list_runs(limit)}


@app.get("/api/tidy/runs/{run_id}")
def tidy_run(run_id: int):
    data = tidy.run_status(run_id)
    if not data:
        raise HTTPException(404, "找不到这个整理任务")
    return data


@app.get("/api/tidy/runs/{run_id}/probe")
def tidy_run_probe(run_id: int, limit: int = Query(30, ge=1, le=200)):
    """开跑前体检，只读。"""
    return tidy.probe_run(run_id, limit)


@app.post("/api/tidy/runs/{run_id}/resume")
def tidy_run_resume(run_id: int):
    """断点续跑：接着搬没搬完的条目。"""
    return tidy.resume_run(run_id)


@app.post("/api/tidy/runs/{run_id}/start")
def tidy_run_start(run_id: int, background: bool = Query(True)):
    """Actually move the files. Background by default so the UI can poll progress."""
    if background:
        threading.Thread(target=tidy.start_run, args=(run_id,), daemon=True).start()
        return {"ok": True, "started": True, "run_id": run_id}
    return tidy.start_run(run_id)


@app.post("/api/tidy/runs/{run_id}/undo")
def tidy_run_undo(run_id: int):
    return tidy.undo_run(run_id)


@app.post("/api/scan")
def scan_library(force: bool = False):
    result = library.scan(force=force)
    log.info("scan: %s", {k: result[k] for k in ("scanned", "added", "updated", "removed", "total")})
    return result


class LikeBody(BaseModel):
    track_id: int


@app.get("/api/likes")
def list_likes(limit: int = Query(1000, ge=1, le=5000)):
    rows = likes.tracks(limit)
    return {
        "count": likes.count(),
        "ids": likes.ids(),
        "items": [_track_json(row, {"liked_at": row["liked_at"]}) for row in rows],
    }


@app.post("/api/likes")
def add_like(body: LikeBody):
    if not _track_row(body.track_id):
        raise HTTPException(404, "track not found")
    likes.add(body.track_id)
    return {"ok": True, "liked": True, "track_id": body.track_id, "count": likes.count()}


@app.delete("/api/likes/{track_id}")
def remove_like(track_id: int):
    likes.remove(track_id)
    return {"ok": True, "liked": False, "track_id": track_id, "count": likes.count()}


class RootPath(BaseModel):
    path: str


@app.get("/api/library/roots")
def library_roots():
    cfg = config.load_config()
    return {"roots": cfg.get("library_roots", []), "active": [str(p) for p in config.library_roots()]}


@app.post("/api/library/roots")
def add_library_root(body: RootPath):
    """Add a folder from the onboarding screen and scan it right away."""
    raw = body.path.strip().strip('"').strip("'")
    if not raw:
        raise HTTPException(400, "路径不能为空")
    folder = Path(raw).expanduser()
    if not folder.is_dir():
        raise HTTPException(400, f"找不到这个文件夹：{raw}")
    cfg = config.load_config()
    roots = [str(item) for item in cfg.get("library_roots", [])]
    if str(folder) not in roots:
        roots.append(str(folder))
    cfg["library_roots"] = roots
    config.CONFIG_PATH.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
    result = library.scan(force=False)
    log.info("add root %s: %s", folder, {k: result[k] for k in ("added", "updated", "total")})
    return {"roots": roots, "scan": result}


PICK_SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "pick-folder.ps1"


@app.post("/api/library/roots/pick")
def pick_library_root():
    """Open a native folder picker on the machine running the server."""
    if not PICK_SCRIPT.is_file():
        raise HTTPException(501, "找不到目录选择脚本")
    target = Path(tempfile.gettempdir()) / f"mh-pick-{os.getpid()}.txt"
    target.unlink(missing_ok=True)
    try:
        subprocess.run(
            [
                "powershell.exe",
                "-NoProfile",
                "-STA",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(PICK_SCRIPT),
                str(target),
            ],
            timeout=180,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            cwd=str(config.ROOT),
        )
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(504, "等待选择目录超时") from exc
    except OSError as exc:
        raise HTTPException(500, f"打不开目录选择窗口：{exc}") from exc
    if not target.exists():
        return {"ok": False, "canceled": True}
    picked = target.read_text(encoding="utf-8-sig").strip()
    target.unlink(missing_ok=True)
    if not picked or not Path(picked).is_dir():
        raise HTTPException(400, "选择的目录不可用")
    return {"ok": True, "path": picked}


# -------------------------------------------------------------------- static
class RevalidatingStatic(StaticFiles):
    """Static files that must be revalidated on every load.

    Without an explicit Cache-Control the browser applies heuristic freshness
    (a fraction of the file age), so an edited app.js could be served from cache
    for minutes — which looked exactly like "Ctrl+R 没生效".
    """

    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = "no-cache, must-revalidate"
        return response


# --------------------------------------------------------------- 局域网口令
@app.middleware("http")
async def lan_guard(request: Request, call_next):
    auth = _auth  # auth 模块本身，不是函数
    if not auth.enabled():
        return await call_next(request)
    host = (request.client.host if request.client else "") or ""
    if host in auth.LOCAL_HOSTS:
        return await call_next(request)

    locked = auth.is_locked(host)
    if locked:
        detail = f"尝试次数过多，请 {locked} 秒后再试"
        headers = {"Retry-After": str(locked)}
        if request.url.path.startswith("/api/"):
            return JSONResponse({"detail": detail}, status_code=429, headers=headers)
        return HTMLResponse(auth.login_page(detail), status_code=429, headers=headers)

    expected = auth.token()
    supplied = request.cookies.get(auth.COOKIE_NAME) or request.query_params.get("token") or ""
    if supplied and hmac.compare_digest(supplied, expected):
        auth.clear_failures(host)
        response = await call_next(request)
        if request.query_params.get("token"):
            # 第一次用 ?token=xxx 进来就种 cookie，之后不用再带
            secure = (request.headers.get("x-forwarded-proto") or "").lower() == "https"
            response.set_cookie(
                auth.COOKIE_NAME, expected, max_age=30 * 24 * 3600,
                httponly=True, samesite="lax", secure=secure,
            )
        return response

    auth.register_failure(host)
    if request.url.path.startswith("/api/"):
        return JSONResponse({"detail": "需要口令：在地址后面加 ?token=xxxxxxxx"}, status_code=401)
    return HTMLResponse(auth.login_page("口令不对，或者还没填。"), status_code=401)


def _require_local(request: Request) -> None:
    """这些接口会带出局域网口令，只允许本机调用。"""
    host = (request.client.host if request.client else "") or ""
    if host not in _auth.LOCAL_HOSTS:
        raise HTTPException(403, "只允许本机访问")


def _lan_url(request: Request) -> str:
    port = request.url.port or 8787
    return f"http://{_auth.lan_ip()}:{port}/?token={_auth.token()}"


@app.get("/api/lan/info")
def lan_info(request: Request):
    """局域网模式信息（含口令，仅本机）。"""
    _require_local(request)
    if not _auth.enabled():
        return {"enabled": False}
    port = request.url.port or 8787
    return {
        "enabled": True,
        "ip": _auth.lan_ip(),
        "port": port,
        "token": _auth.token(),
        "url": _lan_url(request),
        "qr": "/api/lan/qr.png",
    }


@app.get("/api/lan/qr.png")
def lan_qr(request: Request):
    """手机扫码直接打开的二维码（仅本机）。"""
    _require_local(request)
    if not _auth.enabled():
        raise HTTPException(404, "没有开启局域网模式")
    import io

    import qrcode

    buffer = io.BytesIO()
    qrcode.make(_lan_url(request)).save(buffer, format="PNG")
    return Response(
        content=buffer.getvalue(),
        media_type="image/png",
        headers={"Cache-Control": "no-store"},
    )


if config.WEB.is_dir():
    app.mount("/assets", RevalidatingStatic(directory=config.WEB), name="assets")
else:
    log.warning("web 资源目录不存在：%s", config.WEB)


def _index_response(status_code: int = 200):
    """首页；前端资源缺失时给一句能看懂的 503，而不是裸的 Internal Server Error。"""
    index = config.WEB / "index.html"
    if index.is_file():
        return FileResponse(index, status_code=status_code, headers={"Cache-Control": "no-cache"})
    log.error("前端资源缺失：%s", index)
    return HTMLResponse(
        f"""<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>大肥鱼音乐管家 · 前端资源缺失</title>
<style>body{{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b111a;
color:#e8eef8;font-family:system-ui,"Microsoft YaHei",sans-serif;}}
.box{{max-width:560px;padding:28px 26px;border-radius:18px;border:1px solid rgba(255,255,255,.12);
background:#111a26;line-height:1.7;font-size:14px;}}
code{{background:#0b131d;padding:2px 6px;border-radius:6px;word-break:break-all;}}
h1{{font-size:17px;margin:0 0 10px;}}</style></head><body><div class="box">
<h1>找不到前端页面</h1>
<p>后端起来了，但静态资源不在：</p>
<p><code>{html.escape(str(index))}</code></p>
<p>常见原因：打包/重建时 <code>web</code> 目录被清掉还没拷回去。把项目的
<code>web</code> 目录同步到上面这个位置即可，接口本身是正常的。</p>
</div></body></html>""",
        status_code=503,
        headers={"Cache-Control": "no-store"},
    )


@app.get("/")
def index():
    return _index_response()


@app.exception_handler(404)
async def not_found(request: Request, exc):
    if request.url.path.startswith("/api/"):
        return JSONResponse({"detail": "not found"}, status_code=404)
    return _index_response(status_code=200)
