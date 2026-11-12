"""Local library scanning: tags, covers, .lrc lyrics, incremental DB sync."""
from __future__ import annotations

import hashlib
import os
import re
import struct
from pathlib import Path
from typing import Iterable

from mutagen import File as MutagenFile
from mutagen.flac import FLAC
from mutagen.id3 import ID3
from mutagen.mp4 import MP4, MP4Cover

from . import config
from .works import work_key
from .db import connect, now_local

LRC_TS = re.compile(r"\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]")
WORD_TS = re.compile(r"<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?>")
LRC_META = re.compile(r"^\[(ti|ar|al|by|offset|length):(.*)\]$", re.I)
SKIP_DIRS = {"node_modules", ".git", "$recycle.bin", "system volume information", "__pycache__"}


# ---------------------------------------------------------------- metadata
def _mp4_duration_ms(path: Path) -> int:
    """Some WeChat/QQ m4a files have a valid moov that mutagen refuses to read.

    Walk the atom tree by hand and pull timescale/duration out of mvhd.
    """
    try:
        file_size = path.stat().st_size
        with path.open("rb") as fh:
            pos = 0
            while pos + 8 <= file_size:
                fh.seek(pos)
                head = fh.read(8)
                if len(head) < 8:
                    break
                size, box = struct.unpack(">I4s", head)
                header = 8
                if size == 1:
                    ext = fh.read(8)
                    if len(ext) < 8:
                        break
                    size = struct.unpack(">Q", ext)[0]
                    header = 16
                elif size == 0:
                    size = file_size - pos
                if size < header:
                    break
                if box == b"moov":
                    moov = fh.read(size - header)
                    off = 0
                    while off + 8 <= len(moov):
                        msize, mbox = struct.unpack(">I4s", moov[off : off + 8])
                        if msize < 8:
                            break
                        if mbox == b"mvhd":
                            version = moov[off + 8]
                            if version == 0:
                                timescale = struct.unpack(">I", moov[off + 20 : off + 24])[0]
                                duration = struct.unpack(">I", moov[off + 24 : off + 28])[0]
                            else:
                                timescale = struct.unpack(">I", moov[off + 28 : off + 32])[0]
                                duration = struct.unpack(">Q", moov[off + 32 : off + 40])[0]
                            if timescale:
                                return int(duration / timescale * 1000)
                            return 0
                        off += msize
                    return 0
                pos += size
    except (OSError, struct.error, IndexError):
        return 0
    return 0


def _first(value) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        return str(value[0]).strip() if value else ""
    return str(value).strip()


def _cover_bytes(mf) -> tuple[bytes, str] | None:
    """Pull embedded art out of mp3 / flac / m4a without extra deps."""
    try:
        if isinstance(mf, MP4):
            covr = mf.tags.get("covr") if mf.tags else None
            if covr:
                fmt = getattr(covr[0], "imageformat", None)
                ext = ".png" if fmt == MP4Cover.FORMAT_PNG else ".jpg"
                return bytes(covr[0]), ext
        if isinstance(mf, FLAC) and mf.pictures:
            pic = mf.pictures[0]
            ext = ".png" if "png" in (pic.mime or "") else ".jpg"
            return pic.data, ext
        tags = getattr(mf, "tags", None)
        if isinstance(tags, ID3):
            frames = tags.getall("APIC")
            if frames:
                frame = frames[0]
                ext = ".png" if "png" in (frame.mime or "") else ".jpg"
                return frame.data, ext
    except Exception:
        pass
    return None


def _clean_stem(stem: str) -> str:
    stem = re.sub(r"_(L|HQ|SQ|320K|FLAC)$", "", stem, flags=re.I)
    stem = re.sub(r"\s*\((?:1|2|副本)\)$", "", stem)
    return stem.strip(" _-")


def _split_name(stem: str) -> tuple[str, str]:
    stem = _clean_stem(stem)
    for sep in (" - ", " – ", " — ", "－", "-"):
        if sep in stem:
            left, right = stem.split(sep, 1)
            if left.strip() and right.strip():
                return left.strip(), right.strip()
    return "", stem


def read_track(path: Path) -> dict:
    info = {
        "title": "",
        "artist": "",
        "album": "",
        "duration_ms": 0,
        "cover_bytes": None,
        "cover_ext": ".jpg",
        "lyrics": None,
        "lyrics_path": None,
    }
    mf = None
    try:
        mf = MutagenFile(str(path))
    except Exception:
        mf = None

    if mf is not None:
        try:
            length = getattr(getattr(mf, "info", None), "length", 0) or 0
            info["duration_ms"] = int(length * 1000)
        except Exception:
            pass
        try:
            easy = MutagenFile(str(path), easy=True)
            if easy is not None:
                tags = easy.tags or {}
                info["title"] = _first(tags.get("title"))
                info["artist"] = _first(tags.get("artist"))
                info["album"] = _first(tags.get("album"))
        except Exception:
            pass
        art = _cover_bytes(mf)
        if art:
            info["cover_bytes"], info["cover_ext"] = art

    if not info["duration_ms"] and path.suffix.lower() in {".m4a", ".mp4", ".aac"}:
        info["duration_ms"] = _mp4_duration_ms(path)

    if not info["title"]:
        artist, title = _split_name(path.stem)
        info["artist"] = info["artist"] or artist
        info["title"] = title or _clean_stem(path.stem) or path.stem

    # Sidecar lyrics: Windows is case-insensitive, so .with_suffix finds .LRC too.
    try:
        lrc = path.with_suffix(".lrc")
        if lrc.is_file():
            info["lyrics"] = lrc.read_text(encoding="utf-8-sig", errors="replace")
            info["lyrics_path"] = str(lrc)
    except OSError:
        pass
    return info


# ----------------------------------------------------------------- lyrics
def _split_words(content: str, offset: int):
    """Split A2-style content into (plain text, words).

    Enhanced LRC tags each word inline: `[00:12.34]<00:12.34>你<00:12.90>好`.
    Returns words=None when the line has no word tags, so callers can fall back
    to a plain line.
    """
    if "<" not in content:
        return content, None
    matches = list(WORD_TS.finditer(content))
    if not matches:
        return content, None
    parts: list[str] = []
    words: list[dict] = []
    if matches[0].start() > 0:
        parts.append(content[: matches[0].start()])
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(content)
        text = content[match.end() : end]
        if not text:
            continue
        ms = int(match.group(1)) * 60000 + int(match.group(2)) * 1000
        if match.group(3):
            ms += int(match.group(3).ljust(3, "0")[:3])
        words.append({"t": max(0, ms - offset), "text": text})
        parts.append(text)
    plain = "".join(parts).strip()
    if not words:
        return plain or content, None
    return plain, words


def parse_lrc(text: str | None) -> dict:
    """Return {synced, offset_ms, lines:[{t, text, words?}]} from raw LRC text."""
    if not text:
        return {"synced": False, "offset_ms": 0, "lines": []}
    offset = 0
    meta: dict[str, str] = {}
    lines: list[dict] = []
    for raw in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        s = raw.strip()
        if not s:
            continue
        m = LRC_META.match(s)
        if m:
            key, val = m.group(1).lower(), m.group(2).strip()
            meta[key] = val
            if key == "offset":
                try:
                    offset = int(float(val))
                except ValueError:
                    offset = 0
            continue
        stamps = LRC_TS.findall(s)
        if not stamps:
            continue
        content = LRC_TS.sub("", s).strip()
        if not content:
            continue
        plain, words = _split_words(content, offset)
        if not plain:
            continue
        for mm, ss, frac in stamps:
            ms = int(mm) * 60000 + int(ss) * 1000
            if frac:
                ms += int(frac.ljust(3, "0")[:3])
            entry = {"t": max(0, ms - offset), "text": plain}
            if words:
                entry["words"] = words
            lines.append(entry)
    lines.sort(key=lambda x: x["t"])
    deduped = []
    for line in lines:
        if deduped and deduped[-1]["t"] == line["t"] and deduped[-1]["text"] == line["text"]:
            continue
        deduped.append(line)
    return {
        "synced": bool(deduped),
        "offset_ms": offset,
        "lines": deduped,
        "meta": meta,
        "word_sync": any(line.get("words") for line in deduped),
    }


# ------------------------------------------------------------------- scan
def iter_audio(roots: Iterable[Path]):
    for root in roots:
        if not root.is_dir():
            continue
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [
                d for d in dirnames if not d.startswith(".") and d.lower() not in SKIP_DIRS
            ]
            for name in filenames:
                p = Path(dirpath) / name
                if p.suffix.lower() in config.AUDIO_EXTS:
                    yield p


def _track_id(path: Path) -> str:
    return hashlib.sha1(os.path.normcase(str(path)).encode("utf-8")).hexdigest()[:20]


def scan(force: bool = False) -> dict:
    roots = config.library_roots()
    started = now_local()
    result = {
        "roots": [str(r) for r in roots],
        "scanned": 0,
        "added": 0,
        "updated": 0,
        "skipped": 0,
        "removed": 0,
        "errors": [],
        "started_at": started,
    }
    conn = connect()
    seen: set[str] = set()
    try:
        for path in iter_audio(roots):
            try:
                st = path.stat()
            except OSError:
                continue
            result["scanned"] += 1
            provider_id = _track_id(path)
            seen.add(provider_id)
            row = conn.execute(
                "SELECT id, mtime, size, cover, added_at FROM tracks WHERE provider='local' AND provider_id=?",
                (provider_id,),
            ).fetchone()
            if row and not force and abs(row["mtime"] - st.st_mtime) < 1 and row["size"] == st.st_size:
                result["skipped"] += 1
                continue

            meta = read_track(path)
            cover_name = row["cover"] if row else None
            if meta["cover_bytes"]:
                cover_name = f"{provider_id}{meta['cover_ext']}"
                dest = config.COVERS / cover_name
                if not dest.exists() or force:
                    dest.write_bytes(meta["cover_bytes"])

            fingerprint = hashlib.sha1(
                f"{st.st_size}:{int(st.st_mtime)}".encode("ascii")
            ).hexdigest()[:24]
            fmt = path.suffix.lstrip(".").upper() or "AUDIO"
            ts = now_local()
            if row:
                conn.execute(
                    """UPDATE tracks SET title=?, artist=?, album=?, duration_ms=?, path=?,
                       cover=?, lyrics=?, lyrics_path=?, fingerprint=?, format=?, mtime=?, size=?, updated_at=?
                       WHERE id=?""",
                    (
                        meta["title"], meta["artist"], meta["album"], meta["duration_ms"],
                        str(path), cover_name, meta["lyrics"], meta["lyrics_path"],
                        fingerprint, fmt, st.st_mtime, st.st_size, ts, row["id"],
                    ),
                )
                result["updated"] += 1
            else:
                conn.execute(
                    """INSERT INTO tracks(provider, provider_id, title, artist, album, duration_ms,
                       path, cover, lyrics, lyrics_path, fingerprint, format, mtime, size, added_at, updated_at, work_key)
                       VALUES('local',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (
                        provider_id, meta["title"], meta["artist"], meta["album"],
                        meta["duration_ms"], str(path), cover_name, meta["lyrics"],
                        meta["lyrics_path"], fingerprint, fmt, st.st_mtime, st.st_size, ts, ts,
                        work_key(meta["title"], meta["artist"]),
                    ),
                )
                result["added"] += 1
        conn.commit()

        # Drop rows whose file vanished (moved / deleted), and demo leftovers.
        for row in conn.execute("SELECT id, path FROM tracks WHERE provider='local'").fetchall():
            if not Path(row["path"]).exists():
                conn.execute("DELETE FROM tracks WHERE id=?", (row["id"],))
                result["removed"] += 1
        conn.commit()
    except Exception as exc:  # keep the endpoint alive, report the reason
        result["errors"].append(repr(exc))
    finally:
        conn.close()

    result["finished_at"] = now_local()
    result["total"] = count_tracks()
    return result


def count_tracks(provider: str | None = "local") -> int:
    conn = connect()
    try:
        if provider:
            return int(
                conn.execute("SELECT COUNT(*) FROM tracks WHERE provider=?", (provider,)).fetchone()[0]
            )
        return int(conn.execute("SELECT COUNT(*) FROM tracks").fetchone()[0])
    finally:
        conn.close()
