"""QQ Music provider: session cookie + search + vkey resolution + lyrics.

The cookie is the same DPAPI blob the qqmusic-organizer MCP uses
(%LOCALAPPDATA%\\QQMusicOrganizer\\session.dpapi), so there is one login.
"""
from __future__ import annotations

import base64
import ctypes
import json
import os
import random
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from ctypes import wintypes
from datetime import datetime
from pathlib import Path

from .. import config
from .base import AuthRequired, BaseProvider, OnlineTrack, ProviderError

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
REFERER = "https://y.qq.com/"


# --------------------------------------------------------------- DPAPI cookie
CRYPTPROTECT_UI_FORBIDDEN = 0x1


class _DataBlob(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_byte))]


def _blob(data: bytes):
    buffer = ctypes.create_string_buffer(data)
    return _DataBlob(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_byte))), buffer


def _dpapi_decrypt(data: bytes) -> bytes:
    if os.name != "nt":
        raise AuthRequired("QQ 音乐的登录态只能在 Windows 上读取")
    source, source_buffer = _blob(data)
    output = _DataBlob()
    crypt32 = ctypes.windll.crypt32
    kernel32 = ctypes.windll.kernel32
    ok = crypt32.CryptUnprotectData(
        ctypes.byref(source), None, None, None, None, CRYPTPROTECT_UI_FORBIDDEN, ctypes.byref(output)
    )
    del source_buffer
    if not ok:
        raise AuthRequired("QQ 音乐登录态解密失败，请重新登录 qqmusic-organizer")
    try:
        return ctypes.string_at(output.pbData, output.cbData)
    finally:
        kernel32.LocalFree(output.pbData)


def load_cookie(path: Path) -> str | None:
    try:
        encrypted = path.read_bytes()
    except FileNotFoundError:
        return None
    except OSError as exc:
        raise AuthRequired(f"读取 QQ 音乐登录态失败：{exc}") from exc
    try:
        return _dpapi_decrypt(encrypted).decode("utf-8")
    except AuthRequired:
        raise
    except Exception as exc:
        raise AuthRequired(f"QQ 音乐登录态无法解密：{type(exc).__name__}") from exc


# --------------------------------------------------------------------- helpers
def parse_cookie(raw: str) -> dict[str, str]:
    cookies: dict[str, str] = {}
    for part in raw.replace("\n", ";").split(";"):
        name, separator, value = part.strip().partition("=")
        if separator and name:
            cookies[name] = value
    return cookies


def normalized_uin(cookies: dict[str, str]) -> str:
    if cookies.get("login_type") == "2":
        raw = cookies.get("wxuin") or cookies.get("uin") or ""
    else:
        raw = cookies.get("uin") or cookies.get("wxuin") or cookies.get("p_uin") or ""
    value = raw.lstrip("o")
    return value if value.isdigit() else ""


def gtk(skey: str) -> int:
    value = 5381
    for char in skey:
        value += (value << 5) + ord(char)
    return value & 0x7FFFFFFF


def _decode(raw: bytes) -> str:
    for encoding in ("utf-8-sig", "gb18030"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", "replace")


def _loads(text: str) -> dict:
    try:
        payload = json.loads(text)
    except ValueError:
        match = re.search(r"\((\{.*\})\)", text, re.DOTALL)
        if not match:
            raise ProviderError("QQ 音乐返回了无法解析的数据")
        payload = json.loads(match.group(1))
    if not isinstance(payload, dict):
        raise ProviderError("QQ 音乐返回了意外的结构")
    if payload.get("code") in (1, 1000) or payload.get("result") == 301:
        raise AuthRequired("QQ 音乐登录已过期，请重新登录 qqmusic-organizer")
    return payload


class QQProvider(BaseProvider):
    name = "qq"
    label = "QQ 音乐"
    requires_auth = True

    def __init__(self, session_path: Path | None = None):
        self.session_path = session_path or config.QQ_SESSION
        self._lock = threading.Lock()
        self._cookie: str | None = None
        self._cookies: dict[str, str] = {}
        self._uin = ""
        self._gtk = 5381
        self._guid = str(random.randint(10**9, 10**10))
        self._url_cache: dict[str, tuple[str, float]] = {}
        self._loaded = False
        self._session_mtime: float | None = None
        self.last_error: str | None = None
        self.expired = False

    # -- session -----------------------------------------------------------
    def refresh(self) -> None:
        """Forget the cached cookie so the next call re-reads the DPAPI file."""
        with self._lock:
            self._loaded = False
            self._cookie = None
            self._cookies = {}
            self._uin = ""
            self._gtk = 5381
            self._session_mtime = None
            self._url_cache.clear()
            self.last_error = None
            self.expired = False

    def mark_expired(self, message: str) -> None:
        """An upstream call proved the saved login is no longer accepted."""
        self.expired = True
        self.last_error = message or "QQ 音乐登录已失效，请重新登录"

    def _session_stamp(self) -> float | None:
        try:
            return self.session_path.stat().st_mtime
        except OSError:
            return None

    def _ensure_session(self) -> None:
        with self._lock:
            stamp = self._session_stamp()
            # Re-login (or logout) rewrites/removes the file; pick it up without
            # asking the user to restart the server.
            if self._loaded and self._cookie and stamp == self._session_mtime:
                return
            self._loaded = False
            self._cookie = None
            raw = load_cookie(self.session_path)
            if not raw:
                raise AuthRequired(
                    "还没有 QQ 音乐登录态。点「扫码登录」，或运行 `qqmusic-mcp login`。"
                )
            self._cookie = raw
            self._cookies = parse_cookie(raw)
            self._uin = normalized_uin(self._cookies)
            if not self._uin:
                raise AuthRequired("QQ 音乐 cookie 里没有可用的账号 id，请重新登录")
            self._gtk = gtk(self._cookies.get("p_skey") or self._cookies.get("skey") or "")
            self._session_mtime = stamp
            self._loaded = True
            self.last_error = None
            self.expired = False

    def available(self) -> bool:
        if self.expired:
            return False
        try:
            self._ensure_session()
            return True
        except AuthRequired as exc:
            self.last_error = str(exc)
            return False

    def account(self) -> str | None:
        try:
            self._ensure_session()
        except AuthRequired:
            return None
        return self._uin[:4] + "****" + self._uin[-2:]

    def info(self) -> dict:
        exists = self.session_path.exists()
        updated = None
        if exists:
            try:
                updated = datetime.fromtimestamp(self.session_path.stat().st_mtime).astimezone().isoformat(
                    timespec="seconds"
                )
            except OSError:
                updated = None
        ready = self.available()
        if ready:
            message = None
        elif exists:
            message = self.last_error or "登录态不可用，请重新登录"
        else:
            message = "还没有登录"
        return {
            "session_exists": exists,
            "session_updated_at": updated,
            "message": message,
            "expired": self.expired,
        }

    # -- http --------------------------------------------------------------
    def _request(self, method: str, url: str, params: dict | None = None, body: dict | None = None) -> dict:
        self._ensure_session()
        if params:
            url = f"{url}?{urllib.parse.urlencode(params)}"
        data = json.dumps(body).encode("utf-8") if body is not None else None
        headers = {
            "User-Agent": UA,
            "Referer": REFERER,
            "Origin": "https://y.qq.com",
            "Cookie": self._cookie or "",
            "Accept": "application/json, text/plain, */*",
        }
        if data is not None:
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                raw = response.read()
        except urllib.error.HTTPError as exc:
            raise ProviderError(f"QQ 音乐请求失败：HTTP {exc.code}") from exc
        except urllib.error.URLError as exc:
            raise ProviderError(f"QQ 音乐网络不可达：{exc.reason}") from exc
        except TimeoutError as exc:
            raise ProviderError("QQ 音乐请求超时") from exc
        return _loads(_decode(raw))

    def _musicu(self, module: str, method: str, param: dict) -> dict:
        payload = self._request(
            "POST",
            "https://u.y.qq.com/cgi-bin/musicu.fcg",
            {"format": "json", "g_tk": self._gtk},
            {
                "comm": {"ct": 24, "cv": 0, "uin": self._uin},
                "req_0": {"module": module, "method": method, "param": param},
            },
        )
        result = payload.get("req_0")
        if not isinstance(result, dict):
            raise ProviderError("QQ 音乐响应里没有 req_0")
        if result.get("code") in (1000, -1000):
            raise AuthRequired("QQ 音乐登录已过期")
        return result

    # -- API ---------------------------------------------------------------
    def search(self, query: str, limit: int = 20) -> list[OnlineTrack]:
        query = query.strip()
        if not query:
            return []
        limit = min(max(limit, 1), 40)
        payload = self._request(
            "GET",
            "https://c.y.qq.com/soso/fcgi-bin/client_search_cp",
            {
                "w": query,
                "p": 1,
                "n": limit,
                "format": "json",
                "t": 0,
                "cr": 1,
                "catZhida": 1,
                "lossless": 1,
                "flag_qc": 0,
                "remoteplace": "txt.yqq.song",
                "g_tk": self._gtk,
            },
        )
        data = payload.get("data")
        song_data = data.get("song") if isinstance(data, dict) else None
        raw_songs = song_data.get("list") if isinstance(song_data, dict) else None
        if not isinstance(raw_songs, list):
            raise ProviderError("QQ 音乐搜索响应里没有歌曲列表")
        tracks: list[OnlineTrack] = []
        for item in raw_songs:
            if not isinstance(item, dict):
                continue
            mid = str(item.get("mid") or item.get("songmid") or "")
            name = str(item.get("name") or item.get("songname") or "").strip()
            if not mid or not name:
                continue
            album = item.get("album") if isinstance(item.get("album"), dict) else {}
            singers = item.get("singer") if isinstance(item.get("singer"), list) else []
            artist = "、".join(
                str(s.get("name") or s.get("singername"))
                for s in singers
                if isinstance(s, dict) and (s.get("name") or s.get("singername"))
            )
            album_mid = str(album.get("mid") or item.get("albummid") or "")
            tracks.append(
                OnlineTrack(
                    provider=self.name,
                    provider_id=mid,
                    title=name,
                    artist=artist or "未知歌手",
                    album=str(album.get("name") or item.get("albumname") or ""),
                    duration_ms=int(item.get("interval") or 0) * 1000,
                    cover_url=(
                        f"https://y.qq.com/music/photo_new/T002R300x300M000{album_mid}.jpg"
                        if album_mid
                        else None
                    ),
                    format="M4A",
                    extra={"song_id": item.get("id") or item.get("songid")},
                )
            )
        return tracks

    def resolve(self, provider_id: str, force: bool = False) -> str:
        now = time.time()
        with self._lock:
            cached = self._url_cache.get(provider_id)
            if cached and not force and cached[1] > now:
                return cached[0]

        self._ensure_session()
        param = {
            "guid": self._guid,
            "songmid": [provider_id],
            "songtype": [0],
            "uin": self._uin,
            "loginflag": 1,
            "platform": "20",
        }
        attempts = [
            ("music.vkey.GetVkey", "UrlGetVkey"),
            ("vkey.GetVkeyServer", "CgiGetVkey"),
        ]
        last_error = "QQ 音乐没有返回播放地址（可能是版权/会员限制）"
        for module, method in attempts:
            try:
                result = self._musicu(module, method, param)
            except AuthRequired:
                raise
            except ProviderError as exc:
                last_error = str(exc)
                continue
            data = result.get("data") if isinstance(result.get("data"), dict) else {}
            info = (data.get("midurlinfo") or [{}])[0]
            purl = str(info.get("purl") or "")
            if not purl:
                continue
            if purl.startswith("http://") or purl.startswith("https://"):
                url = purl
            else:
                sip = data.get("sip") or ["https://ws.stream.qqmusic.qq.com/"]
                url = str(sip[0]) + purl
            with self._lock:
                self._url_cache[provider_id] = (url, now + 300)
            return url
        raise ProviderError(last_error)

    def invalidate(self, provider_id: str) -> None:
        with self._lock:
            self._url_cache.pop(provider_id, None)

    def lyrics(self, provider_id: str) -> str | None:
        payload = self._request(
            "GET",
            "https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg",
            {"songmid": provider_id, "format": "json", "nobase64": 1, "g_tk": self._gtk},
        )
        lyric = payload.get("lyric")
        if not isinstance(lyric, str) or not lyric.strip():
            return None
        text = lyric.strip()
        if not text.startswith("["):
            try:
                text = base64.b64decode(text).decode("utf-8", "replace")
            except Exception:
                pass
        return text

    # -- playlists ---------------------------------------------------------
    def playlists(self) -> list[dict]:
        """Created playlists for the logged-in account (dirid 201 = 我喜欢)."""
        self._ensure_session()
        payload = self._request(
            "GET",
            "https://c.y.qq.com/rsc/fcgi-bin/fcg_user_created_diss",
            {
                "hostuin": self._uin,
                "sin": 0,
                "size": 200,
                "g_tk": self._gtk,
                "loginUin": self._uin,
                "format": "json",
                "inCharset": "utf8",
                "outCharset": "utf-8",
                "platform": "yqq.json",
            },
        )
        data = payload.get("data")
        if not isinstance(data, dict) or not isinstance(data.get("disslist"), list):
            raise ProviderError("QQ 音乐歌单列表响应异常")
        items: list[dict] = []
        for item in data["disslist"]:
            if not isinstance(item, dict):
                continue
            directory_id = item.get("dirid")
            if not isinstance(directory_id, int):
                continue
            playlist_id = item.get("tid") or item.get("dissid")
            items.append(
                {
                    "directory_id": directory_id,
                    "playlist_id": int(playlist_id) if str(playlist_id).isdigit() else None,
                    "name": str(item.get("diss_name") or item.get("dissname") or "").strip() or "未命名歌单",
                    "song_count": int(item.get("song_cnt") or item.get("songnum") or 0),
                    "liked": directory_id == 201,
                }
            )
        return items

    def playlist_songs(self, playlist_id: int) -> list[OnlineTrack]:
        self._ensure_session()
        payload = self._request(
            "GET",
            "https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg",
            {
                "type": 1,
                "utf8": 1,
                "onlysong": 0,
                "disstid": playlist_id,
                "loginUin": self._uin,
                "format": "json",
                "inCharset": "utf8",
                "outCharset": "utf-8",
            },
        )
        cdlist = payload.get("cdlist")
        if not isinstance(cdlist, list) or not cdlist or not isinstance(cdlist[0], dict):
            raise ProviderError("QQ 音乐歌单详情响应异常")
        raw_songs = cdlist[0].get("songlist")
        if not isinstance(raw_songs, list):
            raise ProviderError("QQ 音乐歌单详情里没有歌曲列表")
        tracks: list[OnlineTrack] = []
        seen: set[str] = set()
        for item in raw_songs:
            if not isinstance(item, dict):
                continue
            mid = str(item.get("mid") or item.get("songmid") or "")
            name = str(item.get("name") or item.get("songname") or "").strip()
            if not mid or not name or mid in seen:
                continue
            seen.add(mid)
            album = item.get("album") if isinstance(item.get("album"), dict) else {}
            album_mid = str(album.get("mid") or item.get("albummid") or "")
            singers = item.get("singer") if isinstance(item.get("singer"), list) else []
            artist = "、".join(
                str(s.get("name") or s.get("singername"))
                for s in singers
                if isinstance(s, dict) and (s.get("name") or s.get("singername"))
            )
            tracks.append(
                OnlineTrack(
                    provider=self.name,
                    provider_id=mid,
                    title=name,
                    artist=artist or "未知歌手",
                    album=str(album.get("name") or item.get("albumname") or ""),
                    duration_ms=int(item.get("interval") or 0) * 1000,
                    cover_url=(
                        f"https://y.qq.com/music/photo_new/T002R300x300M000{album_mid}.jpg"
                        if album_mid
                        else None
                    ),
                    format="M4A",
                    extra={"song_id": item.get("id") or item.get("songid")},
                )
            )
        return tracks
