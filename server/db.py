"""SQLite schema and tiny helpers. One connection per request is plenty here."""
from __future__ import annotations

import sqlite3
from datetime import datetime
from pathlib import Path

from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS tracks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    provider     TEXT NOT NULL DEFAULT 'local',
    provider_id  TEXT NOT NULL,
    title        TEXT NOT NULL,
    artist       TEXT NOT NULL DEFAULT '',
    album        TEXT NOT NULL DEFAULT '',
    duration_ms  INTEGER NOT NULL DEFAULT 0,
    path         TEXT NOT NULL,
    cover        TEXT,
    lyrics       TEXT,
    lyrics_path  TEXT,
    fingerprint  TEXT,
    format       TEXT NOT NULL DEFAULT '',
    mtime        REAL NOT NULL DEFAULT 0,
    size         INTEGER NOT NULL DEFAULT 0,
    added_at     TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    UNIQUE(provider, provider_id)
);
CREATE INDEX IF NOT EXISTS idx_tracks_title  ON tracks(title);
CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);

CREATE TABLE IF NOT EXISTS playlists (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    source     TEXT NOT NULL DEFAULT 'local',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS playlist_tracks (
    playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    track_id    INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    PRIMARY KEY (playlist_id, track_id)
);

CREATE TABLE IF NOT EXISTS qq_playlist_snapshots (
    directory_id INTEGER PRIMARY KEY,
    payload      TEXT NOT NULL,
    updated_ts   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS play_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    track_id    INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    started_at  TEXT NOT NULL,
    ended_at    TEXT,
    played_ms   INTEGER NOT NULL DEFAULT 0,
    source      TEXT NOT NULL DEFAULT 'web',
    completed   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_events_started ON play_events(started_at);
CREATE INDEX IF NOT EXISTS idx_events_track   ON play_events(track_id);

CREATE TABLE IF NOT EXISTS memories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    text       TEXT NOT NULL,
    tags       TEXT NOT NULL DEFAULT '',
    importance INTEGER NOT NULL DEFAULT 3,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS likes (
    track_id   INTEGER PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_likes_created ON likes(created_at);

CREATE TABLE IF NOT EXISTS tidy_runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    root        TEXT NOT NULL,
    layout      TEXT NOT NULL DEFAULT 'hybrid',
    status      TEXT NOT NULL DEFAULT 'pending',
    created_at  TEXT NOT NULL,
    started_at  TEXT,
    finished_at TEXT,
    undone_at   TEXT,
    total       INTEGER NOT NULL DEFAULT 0,
    moved       INTEGER NOT NULL DEFAULT 0,
    failed      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tidy_items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id     INTEGER NOT NULL REFERENCES tidy_runs(id) ON DELETE CASCADE,
    track_id   INTEGER,
    source     TEXT NOT NULL,
    target     TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'pending',
    error      TEXT NOT NULL DEFAULT '',
    title      TEXT NOT NULL DEFAULT '',
    artist     TEXT NOT NULL DEFAULT '',
    size       INTEGER NOT NULL DEFAULT 0,
    touched_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_tidy_items_run ON tidy_items(run_id);
"""


def now_local() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def connect() -> sqlite3.Connection:
    config.DATA.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(config.DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


def init_db() -> None:
    conn = connect()
    try:
        conn.executescript(SCHEMA)
        _migrate(conn)
        conn.commit()
    finally:
        conn.close()


def _migrate(conn: sqlite3.Connection) -> None:
    columns = {row[1] for row in conn.execute("PRAGMA table_info(tracks)")}
    if "format" not in columns:
        conn.execute("ALTER TABLE tracks ADD COLUMN format TEXT NOT NULL DEFAULT ''")
    playlist_columns = {row[1] for row in conn.execute("PRAGMA table_info(playlists)")}
    if "remote_id" not in playlist_columns:
        conn.execute("ALTER TABLE playlists ADD COLUMN remote_id TEXT")
    # 跨平台同曲归并：同一首歌在 QQ / 网易云 / 本地共用 work_key
    if "work_key" not in columns:
        conn.execute("ALTER TABLE tracks ADD COLUMN work_key TEXT")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_tracks_work ON tracks(work_key)")
    from .works import work_key as _work_key

    stale = conn.execute("SELECT id, title, artist FROM tracks WHERE work_key IS NULL OR work_key=''").fetchall()
    for row in stale:
        conn.execute("UPDATE tracks SET work_key=? WHERE id=?", (_work_key(row["title"], row["artist"]), row["id"]))
