"""跨平台同曲归并。

同一首歌在 QQ 音乐、网易云、本地曲库里是三条不同的 track（provider + provider_id 不同），
收藏按「歌名 + 歌手」归一成一个 work_key：收一次，三个平台那条都算收过。

归一化只做保守清洗：全半角统一、小写、去括号注释（Live / 伴奏 / 影视原声）、去标点空白。
「未知歌手」不参与 key，只看歌名，否则不同歌全撞在一起。
"""
from __future__ import annotations

import re
import unicodedata

_BRACKETS = re.compile(r"[(\[（【].*?[)\]）】]")
_PUNCT = re.compile(r"[\s\-_·・.,，。!！?？'\"“”‘’/\\|~、]+")
_UNKNOWN_ARTISTS = {"", "未知歌手", "未知", "unknown", "unknown artist"}


def normalize(text: str | None) -> str:
    value = unicodedata.normalize("NFKC", text or "").lower()
    value = _BRACKETS.sub(" ", value)
    value = _PUNCT.sub("", value)
    return value.strip()


def work_key(title: str | None, artist: str | None) -> str:
    name = normalize(title)
    if not name:
        return ""
    singer = normalize(artist)
    if singer in _UNKNOWN_ARTISTS:
        singer = ""
    return f"{name}|{singer}"
