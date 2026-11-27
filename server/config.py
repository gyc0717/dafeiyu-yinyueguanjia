"""Paths and runtime configuration for music-hub."""
from __future__ import annotations

import json
import os
from pathlib import Path

ROOT = Path(os.environ.get("MUSIC_HUB_ROOT") or Path(__file__).resolve().parent.parent)
DATA = ROOT / "data"
WEB = ROOT / "web"
DB_PATH = DATA / "music_hub.db"
COVERS = DATA / "covers"
DEMO_MUSIC = DATA / "demo-music"
CONFIG_PATH = DATA / "config.json"
ROADMAP_PATH = DATA / "roadmap.json"

AUDIO_EXTS = {".mp3", ".flac", ".m4a", ".ogg", ".opus", ".wav", ".aac", ".wma", ".ape"}

# Same DPAPI session the qqmusic-organizer MCP writes.
QQ_SESSION = Path(
    os.environ.get(
        "MUSIC_HUB_QQ_SESSION",
        str(Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
            / "QQMusicOrganizer" / "session.dpapi"),
    )
)

# Real folders on this machine + the generated demo shelf.
DEFAULT_ROOTS = [
    Path.home() / "Music",
    Path(r"D:\数据\xwechat_files\wxid_liadl08hba0a22_decc\msg\file"),
    DEMO_MUSIC,
]


def _default_config() -> dict:
    return {
        "library_roots": [str(p) for p in DEFAULT_ROOTS],
        "port": 8787,
        "host": "127.0.0.1",
    }


def load_config() -> dict:
    DATA.mkdir(parents=True, exist_ok=True)
    COVERS.mkdir(parents=True, exist_ok=True)
    if not CONFIG_PATH.exists():
        CONFIG_PATH.write_text(
            json.dumps(_default_config(), ensure_ascii=False, indent=2), encoding="utf-8"
        )
    try:
        cfg = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        cfg = _default_config()
    cfg.setdefault("library_roots", [str(p) for p in DEFAULT_ROOTS])
    # Environment override wins, useful for a portable run.
    env_roots = os.environ.get("MUSIC_HUB_ROOTS")
    if env_roots:
        cfg["library_roots"] = [p for p in env_roots.split(";") if p.strip()]
    return cfg


DEFAULT_PREFER_PROVIDERS = ["qq", "netease"]


def provider_preference() -> list[str]:
    """同一首歌在多个平台都有时按这个顺序挑播放源，靠前的优先。

    默认 QQ 在前：本机 QQ 有会员，网易云是非会员号，同曲在网易云只会下到
    30 秒左右的试听片段，排在后面就不会再被选中。
    """
    raw = load_config().get("prefer_providers")
    if not isinstance(raw, list):
        return list(DEFAULT_PREFER_PROVIDERS)
    picked = [str(x).strip() for x in raw if str(x).strip()]
    return picked or list(DEFAULT_PREFER_PROVIDERS)


def library_roots() -> list[Path]:
    roots = []
    for raw in load_config()["library_roots"]:
        try:
            p = Path(raw).expanduser()
        except (TypeError, ValueError):
            continue
        if p.is_dir():
            roots.append(p)
    return roots
