"""网易云音乐接入。

- 搜索 / 歌词 / 播放直链都走明文接口（实测 2026-11 仍可用）
- 没登录也能拿到大部分歌的 128k；少数 VIP / 地区限制歌返回 code=404 + url 为空，
  界面按「拿不到播放地址（可能是 VIP / 版权限制）」提示，不静默失败
"""
from __future__ import annotations

import base64
import time
import json
import random
import string
import urllib.parse
import urllib.request
from pathlib import Path

from .base import AuthRequired, BaseProvider, OnlineTrack, ProviderError

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
# 数据目录统一走 config.DATA：开发时是 <项目>/data，打包后是 MUSIC_HUB_DATA
from .. import config

DATA_DIR = config.DATA
SESSION_PATH = DATA_DIR / "netease_session.dpapi"   # DPAPI 加密后的登录态
LEGACY_SESSION_PATH = DATA_DIR / "netease_session.json"  # 旧版明文，读到就迁移
BASE_COOKIE = "os=pc; appver=2.9.7; channel=netease;"

def time_str() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S")


class NetEaseProvider(BaseProvider):
    name = "netease"
    label = "网易云"
    requires_auth = False

    def __init__(self) -> None:
        self._cache: dict[str, tuple[float, str]] = {}
        self._migrated_owner = False
        self._ids_cache: dict[str, list[int]] = {}
        self._tracks_cache: dict[str, list[dict]] = {}

    # ------------------------------------------------------------- 登录态
    def _session(self) -> dict:
        from .. import secure

        # 优先读 DPAPI 加密版（按当前访客）
        if SESSION_PATH.exists():
            try:
                raw = secure.unprotect(SESSION_PATH.read_bytes())
                return json.loads(raw.decode("utf-8"))
            except Exception:
                return {}
        # 旧版明文：读出来顺手迁移成加密版
        if LEGACY_SESSION_PATH.exists():
            try:
                data = json.loads(LEGACY_SESSION_PATH.read_text(encoding="utf-8"))
            except Exception:
                return {}
            if data.get("music_u"):
                self._save_session(data)
            return data
        return {}

    def _save_session(self, data: dict) -> None:
        from .. import secure

        SESSION_PATH.parent.mkdir(parents=True, exist_ok=True)
        raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
        try:
            SESSION_PATH.write_bytes(secure.protect(raw))
            # 迁移成功后删掉明文
            try:
                LEGACY_SESSION_PATH.unlink()
            except FileNotFoundError:
                pass
        except Exception:
            # 非 Windows / DPAPI 不可用：退回明文，但标记出来
            data = dict(data, plain=True)
            LEGACY_SESSION_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    def _cookie(self) -> str:
        music_u = self._session().get("music_u")
        return BASE_COOKIE + (f" MUSIC_U={music_u};" if music_u else "")

    def logged_in(self) -> bool:
        return bool(self._session().get("music_u"))

    def logout(self) -> None:
        for path in (SESSION_PATH, LEGACY_SESSION_PATH):
            try:
                path.unlink()
            except FileNotFoundError:
                pass
        self._cache.clear()

    def qr_key(self) -> str:
        raw = self._request(
            "https://music.163.com/api/login/qrcode/unikey?type=1",
            form={"type": "1"},
        )
        data = json.loads(raw.decode("utf-8", "replace"))
        key = data.get("unikey")
        if not key:
            raise ProviderError("网易云没有返回扫码 key")
        return key

    def qr_check(self, key: str) -> dict:
        body, headers = self._request_raw(
            "https://music.163.com/api/login/qrcode/client/login?type=1",
            form={"key": key, "type": "1"},
        )
        data = json.loads(body.decode("utf-8", "replace"))
        code = data.get("code")
        cookies = headers.get_all("Set-Cookie") or []
        music_u = ""
        for item in cookies:
            for part in item.split(";"):
                name, _, value = part.strip().partition("=")
                if name == "MUSIC_U" and value:
                    music_u = value
        if code == 803 and music_u:
            self._save_session({"music_u": music_u, "saved_at": time_str()})
            return {"code": 803, "status": "ok", "message": "登录成功"}
        mapping = {800: "二维码过期，点「换一张」", 801: "等待扫码", 802: "已扫码，请在手机上确认"}
        return {"code": code, "status": "wait" if code in (801, 802) else "expired", "message": mapping.get(code, "未知状态")}

    # ---------------------------------------------------------------- helpers
    def _request_raw(
        self, url: str, body: dict | None = None, form: dict | None = None
    ) -> tuple[bytes, object]:
        headers = {
            "User-Agent": UA,
            "Referer": "https://music.163.com/",
            "Cookie": self._cookie(),
        }
        data = None
        if body is not None or form is not None:
            data = urllib.parse.urlencode(body if body is not None else form).encode()
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        req = urllib.request.Request(url, data=data, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=10) as res:
                return res.read(), res.headers
        except Exception as error:  # noqa: BLE001 - surfaced as ProviderError
            raise ProviderError(f"网易云请求失败：{error}") from error

    def _request(self, url: str, body: dict | None = None, form: dict | None = None) -> bytes:
        raw, _headers = self._request_raw(url, body=body, form=form)
        return raw

    def _json(self, url: str, body: dict | None = None, form: dict | None = None) -> dict:
        raw = self._request(url, body=body, form=form)
        try:
            return json.loads(raw.decode("utf-8", "replace"))
        except ValueError as error:
            raise ProviderError("网易云返回的不是 JSON") from error

    # ------------------------------------------------------------------ state
    def available(self) -> bool:
        return True

    def account(self) -> str | None:
        session = self._session()
        if not session.get("music_u"):
            return None
        return session.get("nickname") or "已登录"

    def info(self) -> dict:
        session = self._session()
        if session.get("music_u"):
            return {
                "message": "已扫码登录，可播更高码率",
                "session_updated_at": session.get("saved_at"),
                "expired": False,
            }
        return {"message": "免登录可播 128k；扫码登录后能播更高码率", "expired": False}

    # ----------------------------------------------------------------- search
    def search(self, query: str, limit: int = 20) -> list[OnlineTrack]:
        limit = max(1, min(int(limit), 50))
        data = self._json(
            "https://music.163.com/api/search/get/web",
            form={"s": query, "type": "1", "limit": str(limit), "offset": "0"},
        )
        songs = ((data.get("result") or {}).get("songs")) or []
        tracks: list[OnlineTrack] = []
        for song in songs:
            album = song.get("album") or {}
            artists = song.get("artists") or []
            tracks.append(
                OnlineTrack(
                    provider=self.name,
                    provider_id=str(song.get("id")),
                    title=song.get("name") or "",
                    artist=" / ".join(a.get("name") or "" for a in artists) or "未知歌手",
                    album=album.get("name") or "",
                    duration_ms=int(song.get("duration") or 0),
                    cover_url=album.get("picUrl"),
                    format="MP3",
                )
            )
        return tracks

    # ---------------------------------------------------------------- resolve
    def resolve(self, provider_id: str, force: bool = False) -> str:
        # 缓存 5 分钟，和 QQ 那套一致
        import time

        cached = self._cache.get(provider_id)
        if cached and not force and time.time() - cached[0] < 300:
            return cached[1]
        ids = urllib.parse.quote(f"[{provider_id}]")
        data = self._json(
            f"https://music.163.com/api/song/enhance/player/url?ids={ids}&br={320000 if self.logged_in() else 128000}"
        )
        items = data.get("data") or []
        item = items[0] if items else {}
        url = item.get("url")
        if not url:
            code = item.get("code")
            raise ProviderError(f"网易云没有返回播放地址（code={code}，可能是 VIP / 版权限制）")
        self._cache[provider_id] = (time.time(), url)
        return url

    def invalidate(self, provider_id: str) -> None:
        self._cache.pop(provider_id, None)

    # --------------------------------------------------------------- playlists
    def _uid(self) -> tuple[str | None, str | None]:
        data = self._json("https://music.163.com/api/nuser/account/get")
        profile = data.get("profile") or {}
        uid = profile.get("userId")
        return (str(uid) if uid else None, profile.get("nickname"))

    def playlists(self) -> list[dict]:
        uid, nickname = self._uid()
        if not uid:
            raise AuthRequired("先扫码登录网易云，才能读你的歌单")
        data = self._json(f"https://music.163.com/api/user/playlist?uid={uid}&limit=1000&offset=0")
        items = []
        for item in data.get("playlist") or []:
            items.append(
                {
                    "id": item.get("id"),
                    "name": item.get("name") or "未命名歌单",
                    "count": item.get("trackCount") or 0,
                    "cover": item.get("coverImgUrl"),
                    "creator": (item.get("creator") or {}).get("nickname") or nickname,
                }
            )
        return items

    def _pack(self, song: dict) -> OnlineTrack:
        album = song.get("al") or song.get("album") or {}
        artists = song.get("ar") or song.get("artists") or []
        return OnlineTrack(
            provider=self.name,
            provider_id=str(song.get("id")),
            title=song.get("name") or "",
            artist=" / ".join(a.get("name") or "" for a in artists) or "未知歌手",
            album=album.get("name") or "",
            duration_ms=int(song.get("dt") or song.get("duration") or 0),
            cover_url=album.get("picUrl"),
            format="MP3",
        )

    def _track_ids(self, playlist_id: str) -> list[int]:
        """歌单里全部歌曲 id（v6 详情只给前 1000 条曲目，但 trackIds 是全的）。"""
        cached = self._ids_cache.get(str(playlist_id))
        if cached:
            return cached
        data = self._json(f"https://music.163.com/api/v6/playlist/detail?id={playlist_id}&n=1000")
        playlist = data.get("playlist") or {}
        self._tracks_cache[str(playlist_id)] = playlist.get("tracks") or []
        ids = [int(item["id"]) for item in (playlist.get("trackIds") or []) if item.get("id")]
        if not ids:
            ids = [int(song["id"]) for song in (playlist.get("tracks") or []) if song.get("id")]
        self._ids_cache[str(playlist_id)] = ids
        return ids

    def playlist_total(self, playlist_id: str) -> int:
        return len(self._track_ids(playlist_id))

    def playlist_songs(
        self, playlist_id: str, limit: int = 300, offset: int = 0
    ) -> tuple[list[OnlineTrack], int]:
        """取一页歌曲：按 trackIds 切片，再用 song/detail 每 100 条补全信息。"""
        ids = self._track_ids(playlist_id)
        total = len(ids)
        start = max(0, int(offset))
        count = max(1, int(limit))
        page = ids[start : start + count]
        tracks: list[OnlineTrack] = []
        # 详情里已经带了前 1000 首的完整信息，这一段直接用，省掉几百次详情请求
        fast = self._tracks_cache.get(str(playlist_id)) or []
        if start + len(page) <= len(fast):
            by_id = {int(song.get("id")): song for song in fast if song.get("id")}
            return [self._pack(by_id[tid]) for tid in page if tid in by_id], total
        for index in range(0, len(page), 100):
            chunk = page[index : index + 100]
            data = self._json(
                "https://music.163.com/api/song/detail?ids=[" + ",".join(str(i) for i in chunk) + "]"
            )
            for song in data.get("songs") or []:
                tracks.append(self._pack(song))
        return tracks, total

    # ----------------------------------------------------------------- lyrics
    def lyrics(self, provider_id: str) -> str | None:
        data = self._json(
            "https://music.163.com/api/song/lyric",
            form={"id": provider_id, "lv": "1", "kv": "1", "tv": "-1"},
        )
        lrc = (data.get("lrc") or {}).get("lyric")
        return lrc or None
